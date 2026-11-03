package com.cinecria.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte entre o rtc.js e a captura de tela do Android.
 * start({ sdp }): pede a autorização do sistema, inicia a captura e devolve a resposta SDP.
 * Evento "stopped": a captura acabou por fora do app (notificação ou sistema).
 */
@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {
    private ScreenSession session;

    @PluginMethod
    public void start(PluginCall call) {
        if (call.getString("sdp") == null) {
            call.reject("Oferta SDP ausente.");
            return;
        }
        stopSession();
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, manager.createScreenCaptureIntent(), "onConsent");
    }

    @ActivityCallback
    private void onConsent(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Transmissão cancelada.", "CANCELLED");
            return;
        }
        Intent consent = result.getData();
        // Android 14: o serviço precisa estar em primeiro plano antes de usar a autorização.
        ScreenCaptureService.start(getContext(), new ScreenCaptureService.Callbacks() {
            @Override public void onReady() { startSession(call, consent); }
            @Override public void onFailed(String message) { call.reject(message); }
            @Override public void onStopRequested() { endedOutside(); }
            @Override public void onRotated() { if (session != null) session.updateFormat(); }
        });
    }

    private void startSession(PluginCall call, Intent consent) {
        keepRendererAwake(true);
        session = new ScreenSession(getContext());
        session.start(consent, call.getString("sdp"), new ScreenSession.Listener() {
            @Override public void onAnswer(String sdp) {
                JSObject answer = new JSObject();
                answer.put("sdp", sdp);
                call.resolve(answer);
            }
            @Override public void onError(String message) {
                stopSession();
                call.reject(message);
            }
            @Override public void onEnded() { endedOutside(); }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopSession();
        call.resolve();
    }

    private void endedOutside() {
        stopSession();
        notifyListeners("stopped", new JSObject());
    }

    private void stopSession() {
        if (session != null) {
            session.stop();
            session = null;
        }
        ScreenCaptureService.stop(getContext());
        keepRendererAwake(false);
    }

    /** O WebView reenvia o vídeo mesmo com outro app na frente: o Android não pode rebaixar o processo dele. */
    private void keepRendererAwake(boolean awake) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        getActivity().runOnUiThread(() ->
            getBridge().getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, !awake));
    }

    @Override
    protected void handleOnDestroy() {
        stopSession();
    }
}
