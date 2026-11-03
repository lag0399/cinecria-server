package com.cinecria.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Serviço em primeiro plano exigido pelo Android para capturar a tela (mediaProjection). */
public class ScreenCaptureService extends Service {
    interface Callbacks {
        void onReady();
        void onFailed(String message);
        void onStopRequested();
        void onRotated();
    }

    private static final String CHANNEL = "cinecria_screen";
    private static final String ACTION_STOP = "com.cinecria.app.STOP_SCREEN";
    private static final int NOTIFICATION_ID = 7301;
    private static volatile Callbacks callbacks;

    static void start(Context context, Callbacks cb) {
        callbacks = cb;
        ContextCompat.startForegroundService(context, new Intent(context, ScreenCaptureService.class));
    }

    static void stop(Context context) {
        callbacks = null;
        context.stopService(new Intent(context, ScreenCaptureService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Callbacks cb = callbacks;
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            if (cb != null) cb.onStopRequested();
            return START_NOT_STICKY;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            } else {
                startForeground(NOTIFICATION_ID, buildNotification());
            }
            if (cb != null) cb.onReady();
        } catch (RuntimeException e) {
            if (cb != null) cb.onFailed("O Android não permitiu iniciar a transmissão.");
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        Callbacks cb = callbacks; // recebe a rotação mesmo com outro app na frente
        if (cb != null) cb.onRotated();
    }

    private Notification buildNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Transmissão de tela", NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
            getPackageManager().getLaunchIntentForPackage(getPackageName()), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, ScreenCaptureService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentTitle("Cinecria")
            .setContentText("Transmitindo a tela para a sala")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(0, "Parar", stop)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
