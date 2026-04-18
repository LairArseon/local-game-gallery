import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <section className="modal-panel modal-panel--vault" onClick={(event) => event.stopPropagation()}>
        <form className="modal-panel__body modal-panel__body--vault" onSubmit={handleSubmit}>
          <h3>{t('vaultModal.title')}</h3>
          <p>{t('vaultModal.description')}</p>
          <label className="field modal-panel__vault-field">
            <span>{t('vaultModal.pinLabel')}</span>
            <input
              type="password"
              value={pinValue}
              onChange={(event) => onPinValueChange(event.target.value)}
              autoFocus
              autoComplete="one-time-code"
              placeholder={t('vaultModal.pinPlaceholder')}
            />
          </label>
          {pinError ? <p className="modal-panel__vault-error">{pinError}</p> : null}
          <div className="modal-panel__vault-actions">
            <button className="button" type="button" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="button button--primary" type="submit">{t('vaultModal.unlock')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
