/**
 * Modal prompt used to unlock the vault with a user-configured PIN.
 *
 * This modal is intentionally lightweight and non-security-critical: it gates
 * vault visibility for convenience while keeping interaction patterns aligned
 * with the app's existing modal surfaces.
 *
 * New to this project: this modal is the vault-entry gate; follow submit and error props to useVaultManager's unlock flow and vault-open state.
 */
import { VaultUnlockModal as SharedVaultUnlockModal } from '../../../shared/app-shell/components/VaultUnlockModal';

type VaultUnlockModalProps = {
  pinValue: string;
  pinError: string | null;
  onPinValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function VaultUnlockModal({
  pinValue,
  pinError,
  onPinValueChange,
  onConfirm,
  onCancel,
}: VaultUnlockModalProps) {
  return (
    <SharedVaultUnlockModal
      pinValue={pinValue}
      pinError={pinError}
      onPinValueChange={onPinValueChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}






