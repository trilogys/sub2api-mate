const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { loadTypeScript } = require('./load-typescript.cjs');

global.IS_REACT_ACT_ENVIRONMENT = true;

function loadModalHook(os) {
  return loadTypeScript('src/hooks/use-modal-actions.ts', { 'react-native': { Platform: { OS: os } } }).useModalActions;
}

test('iOS sidebar waits for native dismissal and ignores double taps', async () => {
  const useModalActions = loadModalHook('ios');
  let modal;
  function Harness() { modal = useModalActions(); return null; }
  let root;
  await act(async () => { root = create(React.createElement(Harness)); });
  await act(async () => modal.setVisible(true));
  let confirmations = 0;
  await act(async () => {
    modal.runAfterClose(() => confirmations++);
    modal.runAfterClose(() => confirmations++);
  });
  assert.equal(modal.visible, false);
  assert.equal(confirmations, 0, 'Confirmation cannot present during sidebar dismissal');
  await act(async () => { modal.onDismiss(); modal.onDismiss(); });
  assert.equal(confirmations, 1);
  await act(async () => root.unmount());
});

for (const os of ['android', 'web']) {
  test(`${os} sidebar executes without relying on iOS onDismiss`, async () => {
    const useModalActions = loadModalHook(os);
    let modal;
    function Harness() { modal = useModalActions(); return null; }
    let root;
    await act(async () => { root = create(React.createElement(Harness)); });
    await act(async () => modal.setVisible(true));
    let confirmed = false;
    await act(async () => modal.runAfterClose(() => { confirmed = true; }));
    assert.equal(modal.visible, false);
    assert.equal(confirmed, true);
    await act(async () => root.unmount());
  });
}

test('an asynchronous sidebar action reads current visibility', async () => {
  const useModalActions = loadModalHook('ios');
  let modal;
  function Harness() { modal = useModalActions(); return null; }
  let root;
  await act(async () => { root = create(React.createElement(Harness)); });
  await act(async () => modal.setVisible(true));
  const staleRunAfterClose = modal.runAfterClose;
  await act(async () => modal.setVisible(false));
  let called = false;
  await act(async () => staleRunAfterClose(() => { called = true; }));
  assert.equal(called, true, 'A completed dismissal must not leave an action waiting forever');
  await act(async () => root.unmount());
});

async function createAlertHost(os) {
  let present;
  const { ThemedAlertHost } = loadTypeScript('src/components/themed-alert-host.tsx', {
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', View: 'View', Platform: { OS: os } },
    'lucide-react-native': Object.fromEntries(['CheckCircle2', 'CircleAlert', 'Info', 'TriangleAlert', 'X'].map((name) => [name, name])),
    '@/src/components/localized-text': { Text: 'Text' },
    '@/src/store/themed-alert': { registerThemedAlertPresenter: (fn) => { present = fn; return () => {}; } },
  });
  let root;
  await act(async () => { root = create(React.createElement(ThemedAlertHost)); });
  return { root, present, modal: () => root.root.findByType('Modal') };
}

test('iOS confirmation dismisses before switching; queued alerts stay hidden until then', async () => {
  const { root, present, modal } = await createAlertHost('ios');
  let switches = 0;
  await act(async () => {
    present({ id: 1, title: 'Switch', buttons: [{ text: 'Confirm', onPress: () => switches++ }] });
    present({ id: 2, title: 'Next' });
  });
  const button = root.root.findAllByType('Text').find((node) => node.props.children === 'Confirm').parent;
  await act(async () => { button.props.onPress(); button.props.onPress(); });
  assert.equal(modal().props.visible, false);
  assert.equal(switches, 0);
  await act(async () => { modal().props.onDismiss(); modal().props.onDismiss(); });
  assert.equal(switches, 1);
  assert.equal(modal().props.visible, true);
  assert(root.root.findAllByType('Text').some((node) => node.props.children === 'Next'));
  await act(async () => root.unmount());
});

test('iOS backdrop cancellation waits for dismissal and never confirms', async () => {
  const { root, present, modal } = await createAlertHost('ios');
  let cancelled = 0;
  let confirmed = 0;
  await act(async () => present({ id: 1, title: 'Switch', options: { onDismiss: () => cancelled++ }, buttons: [{ text: 'Confirm', onPress: () => confirmed++ }] }));
  await act(async () => modal().props.onRequestClose());
  assert.equal(cancelled, 0);
  await act(async () => modal().props.onDismiss());
  assert.equal(cancelled, 1);
  assert.equal(confirmed, 0);
  assert.equal(modal().props.visible, false);
  await act(async () => root.unmount());
});
