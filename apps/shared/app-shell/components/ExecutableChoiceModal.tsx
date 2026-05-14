import { Archive, Play } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExecutableChoiceContext } from '../hooks/useModalConfirmations';

type ExecutableChoiceModalProps = {
  context: ExecutableChoiceContext;
  onSelect: (executablePath: string) => void;
  onClose: () => void;
};

export function ExecutableChoiceModal({ context, onSelect, onClose }: ExecutableChoiceModalProps) {
  const { t } = useTranslation();
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, typeof context.candidates>();
    for (const candidate of context.candidates) {
      const existing = groups.get(candidate.versionPath) ?? [];
      existing.push(candidate);
      groups.set(candidate.versionPath, existing);
    }

    return [...groups.values()].map((candidates) => ({
      versionName: candidates[0]?.versionName ?? t('detail.unknown'),
      candidates,
    }));
  }, [context.candidates, t]);

  const title = context.reason === 'resolve-version-mismatch'
    ? t('detail.chooseExecutableMismatchTitle')
    : t('detail.chooseExecutableTemporaryTitle');
  const body = context.reason === 'resolve-version-mismatch'
    ? t('detail.chooseExecutableMismatchBody', { game: context.gameName })
    : t('detail.chooseExecutableTemporaryBody', { game: context.gameName });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--launch-choice" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <div className="launch-choice__heading">
            <h2>{title}</h2>
            <p className="launch-choice__subtitle">{body}</p>
          </div>
          <button className="button" type="button" onClick={onClose}>{t('common.close')}</button>
        </header>
        <div className="modal-panel__body modal-panel__body--launch-choice">
          <div className="launch-choice__groups">
            {groupedCandidates.map((group) => (
              <section key={`${group.versionName}:${group.candidates[0]?.versionPath ?? ''}`} className="launch-choice__group">
                <div className="launch-choice__group-header">
                  <h3>{group.versionName}</h3>
                  <span className="launch-choice__count">{t('detail.chooseExecutableCount', { count: group.candidates.length })}</span>
                </div>
                <div className="launch-choice__list">
                  {group.candidates.map((candidate) => (
                    <button
                      key={`${candidate.versionPath}:${candidate.relativeExecutablePath}`}
                      className="launch-choice__candidate"
                      type="button"
                      onClick={() => onSelect(candidate.executablePath)}
                    >
                      <span className="launch-choice__candidate-main">
                        <span className="launch-choice__candidate-title">
                          <Play size={14} aria-hidden="true" />
                          <strong>{candidate.executableName}</strong>
                        </span>
                        <span className="launch-choice__candidate-path">{candidate.relativeExecutablePath}</span>
                      </span>
                      {candidate.requiresDecompression ? (
                        <span className="launch-choice__candidate-chip">
                          <Archive size={12} aria-hidden="true" />
                          {t('detail.chooseExecutableRequiresDecompression')}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <footer className="modal-panel__footer">
          <button className="button" type="button" onClick={onClose}>{t('common.cancel')}</button>
        </footer>
      </section>
    </div>
  );
}