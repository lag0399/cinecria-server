package com.cinecria.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenCapturePlugin.class); // precisa vir antes do super.onCreate
        super.onCreate(savedInstanceState);
    }
}
