import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import MealLogScreen from './src/screens/MealLogScreen';
import MealHistoryScreen from './src/screens/MealHistoryScreen';
import InsulinLogScreen from './src/screens/InsulinLogScreen';
import EditMealScreen from './src/screens/EditMealScreen';
import EditInsulinScreen from './src/screens/EditInsulinScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AccountScreen from './src/screens/AccountScreen';
import HelpScreen from './src/screens/HelpScreen';
import type { InsulinLogType } from './src/services/storage';

export type RootStackParamList = {
  Home: undefined;
  MealLog: undefined;
  MealHistory: undefined;
  InsulinLog: { type: InsulinLogType };
  EditMeal: { mealId: string };
  EditInsulin: { logId: string };
  Settings: undefined;
  Account: undefined;
  Help: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#000' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: '#000' },
          }}
        >
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
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
          <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Help & FAQ' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
