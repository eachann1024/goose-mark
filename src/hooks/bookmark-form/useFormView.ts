import type { FormView } from './controllerTypes';
import { useMemo } from 'react';
import { iconToDisplayUrl } from '@/services/iconCache';
import { getTemplateLabel } from '@/lib/utils';
import { useBookmarkStore } from '@/stores/bookmark';
export function useFormView({
  form
}: {
  form: FormView;
}) {
  // ---- 计算属性（等价旧版 computed）----
  const isEditing = !!form.editingId;
  const previewText = useMemo(() => {
    const text = (form.draft.title || form.draft.url || '').trim();
    return text ? text.slice(0, 4) : 'ICON';
  }, [form.draft.title, form.draft.url]);
  const previewIconUrl = useMemo(() => iconToDisplayUrl(form.previewIcon ?? undefined), [form.previewIcon]);
  const previewIconStyle = useMemo(() => ({
    backgroundColor: form.previewIcon?.bgColor || 'transparent'
  }), [form.previewIcon]);
  const isDraftTemplate = useMemo(() => /{[^}]+}/.test(form.draft.url), [form.draft.url]);
  const draftTemplateLabel = useMemo(() => getTemplateLabel(form.draft.url), [form.draft.url]);
  const needsBackgroundSave = useMemo(() => {
    if (!form.draft.url.trim()) return false;
    if (form.iconLoading) return true;
    return !form.draft.title.trim();
  }, [form.draft.url, form.draft.title, form.iconLoading]);
  const saveButtonLabel = needsBackgroundSave ? '后台保存' : '保存';
  const selectedLocationsLabel = useMemo(() => {
    if (form.draftLocations.length === 0) return '';
    const groups = useBookmarkStore.getState().groups;
    return form.draftLocations.map(loc => {
      const group = groups.find(g => g.id === loc.groupId);
      const sub = group?.children.find(c => c.id === loc.subGroupId);
      return group && sub ? `${group.name} / ${sub.name}` : '';
    }).filter(Boolean).join(', ');
  }, [form.draftLocations]);
  return {
    isEditing,
    previewText,
    previewIconUrl,
    previewIconStyle,
    isDraftTemplate,
    draftTemplateLabel,
    needsBackgroundSave,
    saveButtonLabel,
    selectedLocationsLabel
  };
}
