import { Row } from "@expo/ui";
import { useState } from "react";

import { Body, Card, Input, PillButton, Screen } from "@/components/ui";
import { useAppLock } from "@/lib/app-lock";

// Shown by the root LockGate whenever the app is locked. PIN entry with an
// optional biometric unlock (user-triggered — see [[ttc-known-issues]]:
// auto-prompting on mount raced the native BiometricPrompt against the
// @expo/ui Compose tree still being composed and crashed the app).
export function LockScreen() {
  const lock = useAppLock();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = async () => {
    const ok = await lock.unlockWithPin(pin);
    if (!ok) {
      setError(true);
      setPin("");
    }
  };

  return (
    <Screen eyebrow="Locked" title="Enter your PIN" subtitle="Your data stays private on this device.">
      <Card spacing={12}>
        <Input onChangeText={setPin} placeholder="PIN" secureTextEntry keyboardType="number-pad" maxLength={8} />
        {error && <Body tone="error" size={13}>Incorrect PIN. Try again.</Body>}
        <Row spacing={12}>
          <PillButton label="Unlock" disabled={pin.length < 4} onPress={submit} />
          <PillButton variant="outline" label="Use biometrics" onPress={() => lock.unlockWithBiometric().catch(() => {})} />
        </Row>
      </Card>
    </Screen>
  );
}
