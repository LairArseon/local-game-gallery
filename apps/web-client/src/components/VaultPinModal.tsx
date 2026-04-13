/**
 * Modal for adding or changing the vault PIN while the vault is open.
 *
 * This flow is intentionally gated behind an unlocked vault state so PIN
 * management is available only to someone who already opened the vault.
 *
 * New to this project: this modal manages add/change PIN input only; trace confirm/cancel callbacks to useVaultManager for validation and persistence.
 */
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section className="modal-panel modal-panel--vault" onClick={(event) => event.stopPropagation()}>
        <form className="modal-panel__body modal-panel__body--vault" onSubmit={handleSubmit}>
          <h3>{hasExistingPin ? t('vaultModal.changePinTitle') : t('vaultModal.addPinTitle')}</h3>
          <p>{hasExistingPin ? t('vaultModal.changePinDescription') : t('vaultModal.addPinDescription')}</p>
          <label className="field modal-panel__vault-field">
            <span>{t('vaultModal.newPinLabel')}</span>
            <input
              type="password"
              value={newPinValue}
              onChange={(event) => onNewPinValueChange(event.target.value)}
              autoFocus
              autoComplete="new-password"
              placeholder={t('vaultModal.newPinPlaceholder')}
            />
          </label>
          <label className="field modal-panel__vault-field">
            <span>{t('vaultModal.confirmPinLabel')}</span>
            <input
              type="password"
              value={confirmPinValue}
              onChange={(event) => onConfirmPinValueChange(event.target.value)}
              autoComplete="new-password"
              placeholder={t('vaultModal.confirmPinPlaceholder')}
            />
          </label>
          {pinError ? <p className="modal-panel__vault-error">{pinError}</p> : null}
          <div className="modal-panel__vault-actions">
            <button className="button" type="button" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="button button--primary" type="submit">{t('vaultModal.savePin')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}






