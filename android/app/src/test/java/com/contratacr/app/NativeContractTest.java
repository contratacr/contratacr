package com.contratacr.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class NativeContractTest {
    @Test
    public void productionPackageNameIsStable() {
        assertEquals("com.contratacr.app", MainActivity.class.getPackage().getName());
    }
}
