import "./global.css";
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts, Outfit_400Regular, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAppForeground } from './src/hooks/useAppForeground';
import { promptBiometric, isBiometricEnabled, setBiometricEnabled, canUseBiometric } from './src/hooks/useBiometric';
import { getDailyTIRHistory, calculateDailyTIR, storeDailyTIR } from './src/utils/timeInRange';
import { fetchGlucoseRange } from './src/services/nightscout';
import DataSharingOnboardingScreen from './src/screens/DataSharingOnboardingScreen';
import AboutMeOnboardingScreen from './src/screens/AboutMeOnboardingScreen';
import EquipmentOnboardingScreen from './src/screens/EquipmentOnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { PortalHost } from '@rn-primitives/portal';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import MealLogScreen from './src/screens/MealLogScreen';
import MealHistoryScreen from './src/screens/MealHistoryScreen';
import InsulinLogScreen from './src/screens/InsulinLogScreen';
import EditMealScreen from './src/screens/EditMealScreen';
import EditInsulinScreen from './src/screens/EditInsulinScreen';
import EditHypoScreen from './src/screens/EditHypoScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AccountScreen from './src/screens/AccountScreen';
import HelpScreen from './src/screens/HelpScreen';
import { COLORS } from './src/theme';
import type { InsulinLogType } from './src/services/storage';
import { migrateLegacySessions, migrateTabletDosing, loadOnboardingFlag, loadEquipmentChangelog, loadHypoTreatments, fetchAndStoreHypoRecoveryCurve } from './src/services/storage';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  DataSharingOnboarding: undefined;
  AboutMeOnboarding: undefined;
  EquipmentOnboarding: undefined;
  Home: undefined;
  MealLog: undefined;
  MealHistory: undefined;
  InsulinLog: { type: InsulinLogType };
  EditMeal: { mealId: string };
  EditInsulin: { logId: string };
  EditHypo: { treatmentId: string };
  Settings: undefined;
  Account: undefined;
  Help: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const BolusBrainDarkTheme = {
  dark: true as const,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    card: COLORS.background,
    text: COLORS.text,
    border: COLORS.separator,
    primary: COLORS.green,
    notification: COLORS.red,
  },
  fonts: DefaultTheme.fonts,
};

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppNavigator() {
  const { session, loading: authLoading, signOut } = useAuth();

  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    JetBrainsMono_400Regular,
  });

  const [gateChecked, setGateChecked] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Home');
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);

  useEffect(() => {
    migrateLegacySessions().catch(err =>
      console.warn('[App] migration error:', err)
    );
    migrateTabletDosing().catch(err =>
      console.warn('[App] tablet migration error:', err)
    );
  }, []);

  // Multi-step onboarding gate: data sharing -> about me -> equipment
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const dsCompleted = await loadOnboardingFlag('data_sharing_onboarding_completed');
        if (!dsCompleted) {
          setInitialRoute('DataSharingOnboarding');
          return;
        }
        const amCompleted = await loadOnboardingFlag('about_me_completed');
        if (!amCompleted) {
          setInitialRoute('AboutMeOnboarding');
          return;
        }
        const entries = await loadEquipmentChangelog();
        if (entries.length === 0) {
          setInitialRoute('EquipmentOnboarding');
          return;
        }
        setInitialRoute('Home');
      } catch {
        setInitialRoute('DataSharingOnboarding');
      } finally {
        setGateChecked(true);
      }
    }
    checkOnboarding();
  }, []);

  // After first login, auto-enable biometric if device supports it
  useEffect(() => {
    if (!session) return;
    canUseBiometric().then(available => {
      if (available) {
        setBiometricEnabled(true).catch(() => {});
      }
    });
  }, [session]);

  // Biometric gate: prompt on app open if session exists and biometric is enabled
  useEffect(() => {
    if (authLoading) return; // wait for session to load
    if (!session) {
      // No session = no biometric needed, go straight to login
      setBiometricChecked(true);
      setBiometricPassed(false);
      return;
    }
    // Session exists — check if biometric is enabled
    isBiometricEnabled().then(async (enabled) => {
      if (!enabled) {
        // Biometric not enabled — skip prompt
        setBiometricChecked(true);
        setBiometricPassed(true);
        return;
      }
      // Prompt biometric
      const success = await promptBiometric('Unlock BolusBrain');
      if (success) {
        setBiometricChecked(true);
        setBiometricPassed(true);
      } else {
        // Biometric failed — sign out via useAuth() hook and show login screen
        await signOut();
        setBiometricChecked(true);
        setBiometricPassed(false);
      }
    });
  }, [authLoading, session]);

  // Release splash when fonts ready OR after error
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // 5-second timeout fallback: release splash regardless
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Foreground handler — TIR calculation + hypo recovery curve fetch (B2B-06, B2B-07)
  const handleForeground = useCallback(async () => {
    // TIR calculation — once per calendar day
    try {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const history = await getDailyTIRHistory();
      if (!history.some(r => r.date === yesterdayStr)) {
        const startMs = Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate()
        );
        const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
        const readings = await fetchGlucoseRange(startMs, endMs);
        const mmolValues = readings.map(r => r.mmol);
        const tir = calculateDailyTIR(mmolValues, yesterdayStr);
        await storeDailyTIR(tir);
      }
    } catch (err) {
      console.warn('[App] TIR foreground calculation failed (non-fatal)', err);
    }

    // Hypo recovery curve fetch — for treatments where 60min window has elapsed
    try {
      const treatments = await loadHypoTreatments();
      const now = Date.now();
      const pending = treatments.filter(t =>
        t.glucose_readings_after === undefined &&
        now - new Date(t.logged_at).getTime() > 60 * 60 * 1000
      );
      for (const treatment of pending) {
        await fetchAndStoreHypoRecoveryCurve(treatment.id).catch(() => {});
      }
    } catch (err) {
      console.warn('[App] hypo recovery fetch failed (non-fatal)', err);
    }
  }, []);

  useAppForeground(handleForeground);

  // Don't render navigation until fonts are ready (or errored/timed out),
  // auth state is loaded, and gate check resolves — prevents flash of wrong screen
  if (authLoading || !biometricChecked || (!fontsLoaded && !fontError) || !gateChecked) {
    return <View style={{ flex: 1, backgroundColor: '#050706' }} />;
  }

  return (
    <NavigationContainer theme={BolusBrainDarkTheme}>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName={session ? initialRoute : 'Login'}
        screenOptions={{
          headerStyle: { backgroundColor: '#050706' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#050706' },
        }}
      >
        {!session ? (
          // Unauthenticated stack
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          // Authenticated stack (all existing screens)
          <>
            <Stack.Screen
              name="DataSharingOnboarding"
              component={DataSharingOnboardingScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="AboutMeOnboarding"
              component={AboutMeOnboardingScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="EquipmentOnboarding"
              component={EquipmentOnboardingScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MealLog" component={MealLogScreen} options={{ title: 'Log meal' }} />
            <Stack.Screen name="MealHistory" component={MealHistoryScreen} options={{ title: 'History' }} />
            <Stack.Screen
              name="InsulinLog"
              component={InsulinLogScreen}
              options={({ route }) => ({
                title: route.params.type === 'long-acting'
                  ? 'Long-acting insulin'
                  : route.params.type === 'tablets'
                  ? 'Tablets'
                  : 'Correction dose',
              })}
            />
            <Stack.Screen name="EditMeal" component={EditMealScreen} options={{ title: 'Edit meal' }} />
            <Stack.Screen name="EditInsulin" component={EditInsulinScreen} options={{ title: 'Edit entry' }} />
            <Stack.Screen name="EditHypo" component={EditHypoScreen} options={{ title: 'Edit treatment' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
            <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
            <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Help & FAQ' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <AppNavigator />
        <PortalHost />
      </SafeAreaProvider>
    </AuthProvider>
  );
}
