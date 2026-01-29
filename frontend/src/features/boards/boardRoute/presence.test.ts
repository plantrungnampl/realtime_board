import { describe, it, expect } from 'vitest';
import { buildCursorMap } from './presence';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';

describe('buildCursorMap', () => {
  it('reuses objects when state is unchanged (optimization)', () => {
    const doc1 = new Y.Doc();
    const awareness1 = new Awareness(doc1);
    const doc2 = new Y.Doc();
    const awareness2 = new Awareness(doc2);

    // Set state on client 2
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      cursor: { x: 10, y: 10 },
      cursor_updated_at: Date.now(),
      color: '#00ff00',
      status: 'online'
    });

    // Sync to client 1
    const update = encodeAwarenessUpdate(awareness2, [awareness2.clientID]);
    applyAwarenessUpdate(awareness1, update, 'remote');

    // First call
    const map1 = buildCursorMap(awareness1, 5000);

    // Second call with previous map
    const map2 = buildCursorMap(awareness1, 5000, map1);

    // Ensure we have entries
    expect(Object.keys(map1).length).toBeGreaterThan(0);

    // They should have same content
    expect(map1).toEqual(map2);

    // Should be same reference now
    expect(map1).toBe(map2);

    // And internal objects should be same references
    const key = Object.keys(map1)[0];
    expect(map1[key]).toBe(map2[key]);
  });

  it('updates objects when state changes', () => {
     const doc1 = new Y.Doc();
    const awareness1 = new Awareness(doc1);
    const doc2 = new Y.Doc();
    const awareness2 = new Awareness(doc2);

    // Set state on client 2
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      cursor: { x: 10, y: 10 },
      cursor_updated_at: Date.now(),
      color: '#00ff00',
      status: 'online'
    });

    // Sync to client 1
    let update = encodeAwarenessUpdate(awareness2, [awareness2.clientID]);
    applyAwarenessUpdate(awareness1, update, 'remote');

    const map1 = buildCursorMap(awareness1, 5000);

    // Change state on client 2
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      cursor: { x: 20, y: 20 }, // Moved
      cursor_updated_at: Date.now(),
      color: '#00ff00',
      status: 'online'
    });

    // Sync again
    update = encodeAwarenessUpdate(awareness2, [awareness2.clientID]);
    applyAwarenessUpdate(awareness1, update, 'remote');

    const map2 = buildCursorMap(awareness1, 5000, map1);

    expect(map1).not.toBe(map2);
    expect(map1).not.toEqual(map2);

    const key = Object.keys(map1)[0];
    expect(map2[key].x).toBe(20);
  });
});
