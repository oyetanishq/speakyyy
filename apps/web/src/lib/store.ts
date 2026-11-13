/** A minimal external store, shaped for useSyncExternalStore. */
export function createStore<T>(initial: T) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set(next: T) {
            if (Object.is(next, value)) return;
            value = next;
            for (const fn of listeners) fn();
        },
        subscribe(fn: () => void) {
            listeners.add(fn);
            return () => {
                listeners.delete(fn);
            };
        },
    };
}

export type Store<T> = ReturnType<typeof createStore<T>>;
