const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTypeScript } = require('./load-typescript.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;

test('iOS modal content uses window insets on every open and after inset changes', async () => {
  let insets = { top: 62, bottom: 34, left: 0, right: 0 };
  const { ModalSafeAreaView } = loadTypeScript('src/components/modal-safe-area-view.tsx', {
    'react-native': { Platform: { OS: 'ios' }, View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'NativeSafeAreaView', useSafeAreaInsets: () => insets },
  });
  const content = () => React.createElement(ModalSafeAreaView, null, 'Sidebar');
  let root;
  await act(async () => { root = create(content()); });
  const assertInsets = () => assert.deepEqual(root.root.findByType('View').props.style, {
    flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right,
  });
  assertInsets();
  assert.equal(root.root.findAllByType('NativeSafeAreaView').length, 0);
  await act(async () => root.update(null));
  await act(async () => root.update(content()));
  assertInsets();
  insets = { top: 0, bottom: 21, left: 59, right: 59 };
  await act(async () => root.update(content()));
  assertInsets();
  await act(async () => root.unmount());
});

test('Android keeps its native safe area without adding window padding twice', async () => {
  const { ModalSafeAreaView } = loadTypeScript('src/components/modal-safe-area-view.tsx', {
    'react-native': { Platform: { OS: 'android' }, View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'NativeSafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) },
  });
  let root;
  await act(async () => { root = create(React.createElement(ModalSafeAreaView, null, 'Sidebar')); });
  assert.deepEqual(root.root.findByType('NativeSafeAreaView').props.edges, ['top', 'bottom']);
  assert.deepEqual(root.root.findByType('NativeSafeAreaView').props.style, { flex: 1 });
  await act(async () => root.unmount());
});
