package com.guleser.evdeegitimtakip;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulamaya ozel eklenti; super.onCreate'ten ONCE kaydedilmeli.
        registerPlugin(ReportBridge.class);
        super.onCreate(savedInstanceState);
    }
}
