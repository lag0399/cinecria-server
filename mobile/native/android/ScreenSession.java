package com.cinecria.app;

import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Display;

import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpParameters;
import org.webrtc.RtpSender;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import org.webrtc.audio.AudioDeviceModule;
import org.webrtc.audio.JavaAudioDeviceModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Captura a tela (MediaProjection) e entrega o vídeo ao WebView por uma conexão WebRTC local,
 * dentro do próprio aparelho. O WebView recebe uma faixa de vídeo comum e o rtc.js a transmite
 * para a sala pelo mesmo caminho do PC. Só vídeo: esta conexão não leva áudio.
 */
final class ScreenSession {
    interface Listener {
        void onAnswer(String sdp);
        void onError(String message);
        void onEnded();
    }

    // O vídeo é codificado duas vezes (aqui e no WebView): 1280 no lado maior poupa o celular.
    private static final int MAX_SIDE = 1280;
    private static final int FPS = 30;
    private static final int LOOPBACK_MAX_BPS = 20_000_000;
    private static final int GATHER_TIMEOUT_MS = 3000;
    private static boolean webrtcReady = false;

    private final Context context;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean stopped = false;
    private boolean answered = false;

    private Listener listener;
    private EglBase egl;
    private AudioDeviceModule audioModule;
    private PeerConnectionFactory factory;
    private SurfaceTextureHelper textures;
    private VideoSource source;
    private VideoTrack track;
    private ScreenCapturerAndroid capturer;
    private PeerConnection peer;

    ScreenSession(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Os avisos do WebRTC podem chegar depois do stop(): aí não há mais o que fazer. */
    private void run(Runnable task) {
        try { worker.execute(task); } catch (RejectedExecutionException ignored) {}
    }

    void start(Intent consent, String offerSdp, Listener listener) {
        this.listener = listener;
        run(() -> {
            try {
                openCapture(consent);
                negotiate(offerSdp);
            } catch (RuntimeException e) {
                fail("Falha ao iniciar a captura: " + e.getMessage());
            }
        });
    }

    private void openCapture(Intent consent) {
        if (!webrtcReady) {
            PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions());
            webrtcReady = true;
        }
        egl = EglBase.create();
        audioModule = JavaAudioDeviceModule.builder(context).createAudioDeviceModule();
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
            .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
            .createPeerConnectionFactory();

        textures = SurfaceTextureHelper.create("CinecriaScreen", egl.getEglBaseContext());
        source = factory.createVideoSource(true);
        capturer = new ScreenCapturerAndroid(consent, new MediaProjection.Callback() {
            @Override public void onStop() { ended(); } // "Parar" do próprio sistema
        });
        capturer.initialize(textures, context, source.getCapturerObserver());
        int[] size = screenSize();
        capturer.startCapture(size[0], size[1], FPS);
        source.adaptOutputFormat(size[0], size[1], FPS); // a captura ignora o FPS pedido: o limite fica aqui
        track =factory.createVideoTrack("cinecria-screen", source);
    }

    private void negotiate(String offerSdp) {
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(new ArrayList<>());
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        config.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE;
        config.rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE;
        config.tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.DISABLED;
        peer = factory.createPeerConnection(config, observer);
        if (peer == null) throw new IllegalStateException("conexão local indisponível");

        peer.setRemoteDescription(new Sdp() {
            @Override public void onSetSuccess() {
                run(() -> {
                    if (stopped) return;
                    RtpSender sender = peer.addTrack(track, Collections.singletonList("cinecria-screen"));
                    tune(sender);
                    createAnswer();
                });
            }
        }, new SessionDescription(SessionDescription.Type.OFFER, offerSdp));
    }

    /** Dentro do aparelho não falta banda: a qualidade é decidida no envio para a sala. */
    private void tune(RtpSender sender) {
        peer.setBitrate(2_000_000, 8_000_000, LOOPBACK_MAX_BPS);
        RtpParameters params = sender.getParameters();
        params.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_RESOLUTION;
        for (RtpParameters.Encoding e : params.encodings) {
            e.maxBitrateBps = LOOPBACK_MAX_BPS;
            e.maxFramerate = FPS;
        }
        sender.setParameters(params);
    }

    private void createAnswer() {
        peer.createAnswer(new Sdp() {
            @Override public void onCreateSuccess(SessionDescription answer) {
                run(() -> {
                    if (stopped) return;
                    peer.setLocalDescription(new Sdp() {
                        @Override public void onSetSuccess() {
                            main.postDelayed(() -> run(ScreenSession.this::deliverAnswer), GATHER_TIMEOUT_MS);
                        }
                    }, answer);
                });
            }
        }, new MediaConstraints());
    }

    /** Sem trickle: a resposta só sai com os candidatos dentro (ou ao fim do tempo limite). */
    private void deliverAnswer() {
        if (stopped || answered || peer == null || peer.getLocalDescription() == null) return;
        answered = true;
        listener.onAnswer(peer.getLocalDescription().description);
    }

    private abstract class Sdp implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription description) {}
        @Override public void onSetSuccess() {}
        @Override public void onCreateFailure(String error) { fail("Falha na conexão local: " + error); }
        @Override public void onSetFailure(String error) { fail("Falha na conexão local: " + error); }
    }

    private final PeerConnection.Observer observer = new PeerConnection.Observer() {
        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) run(ScreenSession.this::deliverAnswer);
        }
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {
            if (state == PeerConnection.IceConnectionState.FAILED) ended();
        }
        @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
        @Override public void onIceConnectionReceivingChange(boolean receiving) {}
        @Override public void onIceCandidate(IceCandidate candidate) {}
        @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
        @Override public void onAddStream(MediaStream stream) {}
        @Override public void onRemoveStream(MediaStream stream) {}
        @Override public void onDataChannel(DataChannel channel) {}
        @Override public void onRenegotiationNeeded() {}
    };

    /** Em pé ou deitado: acompanha a rotação da tela. */
    void updateFormat() {
        run(() -> {
            if (stopped || capturer == null) return;
            int[] size = screenSize();
            capturer.changeCaptureFormat(size[0], size[1], FPS);
            source.adaptOutputFormat(size[0], size[1], FPS);
        });
    }

    private int[] screenSize() {
        Display display = ((DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE)).getDisplay(Display.DEFAULT_DISPLAY);
        DisplayMetrics metrics = new DisplayMetrics();
        display.getRealMetrics(metrics);
        double scale = Math.min(1, (double) MAX_SIDE / Math.max(metrics.widthPixels, metrics.heightPixels));
        return new int[] { alignedTo16(metrics.widthPixels * scale), alignedTo16(metrics.heightPixels * scale) };
    }

    /** O encoder H.264 de hardware (visto no MediaTek do POCO X6 Pro) não entrega nada com largura 574. */
    private static int alignedTo16(double side) {
        return (int) Math.round(side / 16) * 16;
    }

    private void fail(String message) {
        main.post(() -> { if (!stopped && listener != null) listener.onError(message); });
    }

    private void ended() {
        main.post(() -> { if (!stopped && listener != null) listener.onEnded(); });
    }

    void stop() {
        if (stopped) return;
        stopped = true;
        main.removeCallbacksAndMessages(null);
        run(this::release);
        worker.shutdown();
    }

    private void release() {
        if (capturer != null) {
            try { capturer.stopCapture(); } catch (RuntimeException ignored) {}
            capturer.dispose();
        }
        if (peer != null) peer.close();
        if (peer != null) peer.dispose();
        if (track != null) track.dispose();
        if (source != null) source.dispose();
        if (textures != null) textures.dispose();
        if (factory != null) factory.dispose();
        if (audioModule != null) audioModule.release();
        if (egl != null) egl.release();
    }
}
