import { describe, it, expect } from 'vitest';
import { buildCursorMap, buildSelectionPresence } from './presence';
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

describe('buildSelectionPresence', () => {
  it('reuses array and objects when state is unchanged', () => {
    const doc1 = new Y.Doc();
    const awareness1 = new Awareness(doc1);
    const doc2 = new Y.Doc();
    const awareness2 = new Awareness(doc2);

    // Set selection on client 2
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      selection: ['el1', 'el2'],
      selection_updated_at: Date.now(),
      color: '#00ff00'
    });

    const update = encodeAwarenessUpdate(awareness2, [awareness2.clientID]);
    applyAwarenessUpdate(awareness1, update, 'remote');

    const list1 = buildSelectionPresence(awareness1, 'user1', 5000);
    const list2 = buildSelectionPresence(awareness1, 'user1', 5000, list1);

    expect(list1.length).toBe(1);
    expect(list1).toEqual(list2);
    expect(list1).toBe(list2);
    expect(list1[0]).toBe(list2[0]);
  });

  it('reuses objects even if order changes (e.g. last_seen update)', () => {
    const doc1 = new Y.Doc();
    const awareness1 = new Awareness(doc1);

    const doc2 = new Y.Doc();
    const awareness2 = new Awareness(doc2); // User 2

    const doc3 = new Y.Doc();
    const awareness3 = new Awareness(doc3); // User 3

    const now = Date.now();

    // User 2 setup
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      selection: ['el1'],
      selection_updated_at: now - 2000,
      color: 'red'
    });
    applyAwarenessUpdate(awareness1, encodeAwarenessUpdate(awareness2, [awareness2.clientID]), 'remote');

    // User 3 setup
    awareness3.setLocalState({
      user: { id: 'user3', name: 'User 3' },
      selection: ['el2'],
      selection_updated_at: now - 1000, // Newer than User 2
      color: 'blue'
    });
    applyAwarenessUpdate(awareness1, encodeAwarenessUpdate(awareness3, [awareness3.clientID]), 'remote');

    // Initial build. Sort order: User 3 (newer), User 2 (older)
    const list1 = buildSelectionPresence(awareness1, 'user1', 50000);

    expect(list1.length).toBe(2);
    expect(list1[0].user_id).toBe('user3');
    expect(list1[1].user_id).toBe('user2');

    // Update User 2 timestamp to be newer than User 3
    awareness2.setLocalState({
      user: { id: 'user2', name: 'User 2' },
      selection: ['el1'],
      selection_updated_at: now, // Newer than User 3 (now - 1000)
      color: 'red'
    });
    applyAwarenessUpdate(awareness1, encodeAwarenessUpdate(awareness2, [awareness2.clientID]), 'remote');

    // Second build. Sort order: User 2 (newer), User 3 (older)
    const list2 = buildSelectionPresence(awareness1, 'user1', 50000, list1);

    expect(list2[0].user_id).toBe('user2');
    expect(list2[1].user_id).toBe('user3');

    // Array reference MUST change because order changed
    expect(list2).not.toBe(list1);

    // But object references SHOULD be reused because content didn't change (only timestamp which is stripped)
    const user2_prev = list1.find(u => u.user_id === 'user2');
    const user2_next = list2.find(u => u.user_id === 'user2');
    expect(user2_next).toBe(user2_prev);

    const user3_prev = list1.find(u => u.user_id === 'user3');
    const user3_next = list2.find(u => u.user_id === 'user3');
    expect(user3_next).toBe(user3_prev);
  });
});
