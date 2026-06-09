import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';

type IsolationMetadataEditorSectionProps = {
  context: BuiltInModuleRenderContext;
};

export function IsolationMetadataEditorSection({ context }: IsolationMetadataEditorSectionProps) {
  const metadataDraft = context.metadataDraft;
  if (!metadataDraft || !context.onMetadataDraftChange) {
    return null;
  }

  const allowsInternetAccess = metadataDraft.restrictNetworkAccess !== true;

  return (
    <label className="field field--toggle">
      <span>Allow internet access</span>
      <input
        type="checkbox"
        checked={allowsInternetAccess}
        onChange={(event) => {
          const nextAllowsInternetAccess = event.target.checked;
          context.onMetadataDraftChange?.((current) => ({
            ...current,
            restrictNetworkAccess: !nextAllowsInternetAccess,
          }));
        }}
      />
      <small className="field__hint">
        Leave this off to launch the game through the Isolation module with network access restricted.
      </small>
    </label>
  );
}
