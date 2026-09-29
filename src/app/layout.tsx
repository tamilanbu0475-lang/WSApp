import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'simple_push',
        animationDuration: 250,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        contentStyle: {
          backgroundColor: '#FDF8F9',
        },
      }}
    >
      <Stack.Screen name="splash" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="otp" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="contacts" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="report" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="support" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="alert" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
