/**
 * Modal for adding or changing the vault PIN while the vault is open.
 *
 * This flow is intentionally gated behind an unlocked vault state so PIN
 * management is available only to someone who already opened the vault.
 *
 * New to this project: this modal manages add/change PIN input only; trace confirm/cancel callbacks to useVaultManager for validation and persistence.
 */
import { VaultPinModal as SharedVaultPinModal } from '../../../shared/app-shell/components/VaultPinModal';

type VaultPinModalProps = {
  hasExistingPin: boolean;
  newPinValue: string;
  confirmPinValue: string;
  pinError: string | null;
  onNewPinValueChange: (value: string) => void;
  onConfirmPinValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function VaultPinModal({
  hasExistingPin,
  newPinValue,
  confirmPinValue,
  pinError,
  onNewPinValueChange,
  onConfirmPinValueChange,
  onConfirm,
  onCancel,
}: VaultPinModalProps) {
  return (
    <SharedVaultPinModal
      hasExistingPin={hasExistingPin}
      newPinValue={newPinValue}
      confirmPinValue={confirmPinValue}
      pinError={pinError}
      onNewPinValueChange={onNewPinValueChange}
      onConfirmPinValueChange={onConfirmPinValueChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}






