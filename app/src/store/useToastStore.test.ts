import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, toast } from './useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('starts with no toasts', () => {
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('push adds a toast with the given type and message', () => {
    useToastStore.getState().push('error', 'Could not delete quest.');
    const [t] = useToastStore.getState().toasts;
    expect(t.type).toBe('error');
    expect(t.message).toBe('Could not delete quest.');
    expect(t.id).toBeTruthy();
  });

  it('assigns each toast a unique id, oldest first', () => {
    useToastStore.getState().push('error', 'first');
    useToastStore.getState().push('success', 'second');
    const [a, b] = useToastStore.getState().toasts;
    expect(a.id).not.toBe(b.id);
    expect(a.message).toBe('first');
    expect(b.message).toBe('second');
  });

  it('dismiss removes only the matching toast', () => {
    useToastStore.getState().push('error', 'keep me');
    useToastStore.getState().push('error', 'remove me');
    const [keep, remove] = useToastStore.getState().toasts;
    useToastStore.getState().dismiss(remove.id);

    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(keep.id);
  });

  describe('toast helper', () => {
    it('toast.error/success/info push the corresponding type', () => {
      toast.error('bad');
      toast.success('good');
      toast.info('fyi');

      const types = useToastStore.getState().toasts.map((t) => t.type);
      expect(types).toEqual(['error', 'success', 'info']);
    });
  });
});
