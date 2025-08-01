import { useGlobalMenuClose, useToken } from '@invoke-ai/ui-library';
import { useStore } from '@nanostores/react';
import type {
  EdgeChange,
  HandleType,
  NodeChange,
  NodeMouseHandler,
  OnEdgesChange,
  OnInit,
  OnMoveEnd,
  OnNodesChange,
  OnReconnect,
  ProOptions,
  ReactFlowProps,
  ReactFlowState,
} from '@xyflow/react';
import {
  Background,
  ReactFlow,
  SelectionMode,
  useStore as useReactFlowStore,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { useAppDispatch, useAppSelector, useAppStore } from 'app/store/storeHooks';
import { useFocusRegion, useIsRegionFocused } from 'common/hooks/focus';
import { $isSelectingOutputNode, $outputNodeId } from 'features/nodes/components/sidePanel/workflow/publish';
import { useConnection } from 'features/nodes/hooks/useConnection';
import { useIsValidConnection } from 'features/nodes/hooks/useIsValidConnection';
import { useIsWorkflowEditorLocked } from 'features/nodes/hooks/useIsWorkflowEditorLocked';
import { useNodeCopyPaste } from 'features/nodes/hooks/useNodeCopyPaste';
import {
  $addNodeCmdk,
  $cursorPos,
  $didUpdateEdge,
  $edgePendingUpdate,
  $lastEdgeUpdateMouseEvent,
  $pendingConnection,
  $viewport,
  edgesChanged,
  nodesChanged,
  redo,
  undo,
} from 'features/nodes/store/nodesSlice';
import { $flow, $needsFit } from 'features/nodes/store/reactFlowInstance';
import {
  selectEdges,
  selectMayRedo,
  selectMayUndo,
  selectNodes,
  selectNodesSlice,
} from 'features/nodes/store/selectors';
import { connectionToEdge } from 'features/nodes/store/util/reactFlowUtil';
import { selectSelectionMode, selectShouldSnapToGrid } from 'features/nodes/store/workflowSettingsSlice';
import { NO_DRAG_CLASS, NO_PAN_CLASS, NO_WHEEL_CLASS } from 'features/nodes/types/constants';
import { type AnyEdge, type AnyNode, isInvocationNode } from 'features/nodes/types/invocation';
import { useRegisteredHotkeys } from 'features/system/components/HotkeysModal/useHotkeyData';
import type { CSSProperties, MouseEvent } from 'react';
import { memo, useCallback, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import CustomConnectionLine from './connectionLines/CustomConnectionLine';
import InvocationCollapsedEdge from './edges/InvocationCollapsedEdge';
import InvocationDefaultEdge from './edges/InvocationDefaultEdge';
import CurrentImageNode from './nodes/CurrentImage/CurrentImageNode';
import InvocationNodeWrapper from './nodes/Invocation/InvocationNodeWrapper';
import NotesNode from './nodes/Notes/NotesNode';

const edgeTypes = {
  collapsed: InvocationCollapsedEdge,
  default: InvocationDefaultEdge,
} as const;

const nodeTypes = {
  invocation: InvocationNodeWrapper,
  current_image: CurrentImageNode,
  notes: NotesNode,
} as const;

// TODO: can we support reactflow? if not, we could style the attribution so it matches the app
const proOptions: ProOptions = { hideAttribution: true };

const snapGrid: [number, number] = [25, 25];

const selectCancelConnection = (state: ReactFlowState) => state.cancelConnection;

export const Flow = memo(() => {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector(selectNodes);
  const edges = useAppSelector(selectEdges);
  const viewport = useStore($viewport);
  const shouldSnapToGrid = useAppSelector(selectShouldSnapToGrid);
  const selectionMode = useAppSelector(selectSelectionMode);
  const { onConnectStart, onConnect, onConnectEnd } = useConnection();
  const flowWrapper = useRef<HTMLDivElement>(null);
  const isValidConnection = useIsValidConnection();
  const updateNodeInternals = useUpdateNodeInternals();
  const isLocked = useIsWorkflowEditorLocked();

  useFocusRegion('workflows', flowWrapper);

  const [borderRadius] = useToken('radii', ['base']);
  const flowStyles = useMemo<CSSProperties>(() => ({ borderRadius }), [borderRadius]);

  const onNodesChange: OnNodesChange<AnyNode> = useCallback(
    (nodeChanges) => {
      dispatch(nodesChanged(nodeChanges));
      const flow = $flow.get();
      if (!flow) {
        return;
      }
      if ($needsFit.get()) {
        $needsFit.set(false);
        flow.fitView();
      }
    },
    [dispatch]
  );

  const onEdgesChange: OnEdgesChange<AnyEdge> = useCallback(
    (changes) => {
      if (changes.length > 0) {
        dispatch(edgesChanged(changes));
      }
    },
    [dispatch]
  );

  const handleMoveEnd: OnMoveEnd = useCallback((e, viewport) => {
    $viewport.set(viewport);
  }, []);

  const { onCloseGlobal } = useGlobalMenuClose();
  const handlePaneClick = useCallback(() => {
    onCloseGlobal();
  }, [onCloseGlobal]);

  const onInit: OnInit<AnyNode, AnyEdge> = useCallback((flow) => {
    $flow.set(flow);
    flow.fitView();
  }, []);

  const onMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (flowWrapper.current?.getBoundingClientRect()) {
      $cursorPos.set(
        $flow.get()?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }) ?? null
      );
    }
  }, []);

  // #region Updatable Edges

  /**
   * Adapted from https://reactflow.dev/docs/examples/edges/updatable-edge/
   * and https://reactflow.dev/docs/examples/edges/delete-edge-on-drop/
   *
   * - Edges can be dragged from one handle to another.
   * - If the user drags the edge away from the node and drops it, delete the edge.
   * - Do not delete the edge if the cursor didn't move (resolves annoying behaviour
   *   where the edge is deleted if you click it accidentally).
   */

  const onReconnectStart = useCallback((event: MouseEvent, edge: AnyEdge, _handleType: HandleType) => {
    $edgePendingUpdate.set(edge);
    $didUpdateEdge.set(false);
    $lastEdgeUpdateMouseEvent.set(event);
  }, []);

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      // This event is fired when an edge update is successful
      $didUpdateEdge.set(true);
      // When an edge update is successful, we need to delete the old edge and create a new one
      const newEdge = connectionToEdge(newConnection);
      dispatch(
        edgesChanged([
          { type: 'remove', id: oldEdge.id },
          { type: 'add', item: newEdge },
        ])
      );
      // Because we shift the position of handles depending on whether a field is connected or not, we must use
      // updateNodeInternals to tell reactflow to recalculate the positions of the handles
      updateNodeInternals([oldEdge.source, oldEdge.target, newEdge.source, newEdge.target]);
    },
    [dispatch, updateNodeInternals]
  );

  const onReconnectEnd: NonNullable<ReactFlowProps['onReconnectEnd']> = useCallback(
    (e, edge, _handleType) => {
      const didUpdateEdge = $didUpdateEdge.get();
      // Fall back to a reasonable default event
      const lastEvent = $lastEdgeUpdateMouseEvent.get() ?? { clientX: 0, clientY: 0 };
      // We have to narrow this event down to MouseEvents - could be TouchEvent
      const didMouseMove =
        !('touches' in e) && Math.hypot(e.clientX - lastEvent.clientX, e.clientY - lastEvent.clientY) > 5;

      // If we got this far and did not successfully update an edge, and the mouse moved away from the handle,
      // the user probably intended to delete the edge
      if (!didUpdateEdge && didMouseMove) {
        dispatch(edgesChanged([{ type: 'remove', id: edge.id }]));
      }

      $edgePendingUpdate.set(null);
      $didUpdateEdge.set(false);
      $pendingConnection.set(null);
      $lastEdgeUpdateMouseEvent.set(null);
    },
    [dispatch]
  );

  // #endregion

  const onNodeClick = useCallback<NodeMouseHandler<AnyNode>>((e, node) => {
    if (!$isSelectingOutputNode.get()) {
      return;
    }
    if (!isInvocationNode(node)) {
      return;
    }
    const { id } = node.data;
    $outputNodeId.set(id);
    $isSelectingOutputNode.set(false);
  }, []);

  return (
    <>
      <ReactFlow<AnyNode, AnyEdge>
        id="workflow-editor"
        ref={flowWrapper}
        defaultViewport={viewport}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onMouseMove={onMouseMove}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onConnectStart={onConnectStart}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onMoveEnd={handleMoveEnd}
        connectionLineComponent={CustomConnectionLine}
        isValidConnection={isValidConnection}
        edgesFocusable={!isLocked}
        edgesReconnectable={!isLocked}
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        nodesFocusable={!isLocked}
        elementsSelectable={!isLocked}
        minZoom={0.1}
        snapToGrid={shouldSnapToGrid}
        snapGrid={snapGrid}
        connectionRadius={30}
        proOptions={proOptions}
        style={flowStyles}
        onPaneClick={handlePaneClick}
        deleteKeyCode={null}
        selectionMode={selectionMode === 'full' ? SelectionMode.Full : SelectionMode.Partial}
        elevateEdgesOnSelect
        nodeDragThreshold={1}
        noDragClassName={NO_DRAG_CLASS}
        noWheelClassName={NO_WHEEL_CLASS}
        noPanClassName={NO_PAN_CLASS}
      >
        <Background gap={snapGrid} offset={snapGrid} />
      </ReactFlow>
      <HotkeyIsolator />
    </>
  );
});

Flow.displayName = 'Flow';

const HotkeyIsolator = memo(() => {
  const isLocked = useIsWorkflowEditorLocked();

  const mayUndo = useAppSelector(selectMayUndo);
  const mayRedo = useAppSelector(selectMayRedo);

  const cancelConnection = useReactFlowStore(selectCancelConnection);

  const store = useAppStore();
  const isWorkflowsFocused = useIsRegionFocused('workflows');

  const { copySelection, pasteSelection, pasteSelectionWithEdges } = useNodeCopyPaste();

  useRegisteredHotkeys({
    id: 'copySelection',
    category: 'workflows',
    callback: copySelection,
    options: { enabled: isWorkflowsFocused && !isLocked, preventDefault: true },
    dependencies: [copySelection],
  });

  const selectAll = useCallback(() => {
    const { nodes, edges } = selectNodesSlice(store.getState());
    const nodeChanges: NodeChange<AnyNode>[] = [];
    const edgeChanges: EdgeChange<AnyEdge>[] = [];
    nodes.forEach(({ id, selected }) => {
      if (!selected) {
        nodeChanges.push({ type: 'select', id, selected: true });
      }
    });
    edges.forEach(({ id, selected }) => {
      if (!selected) {
        edgeChanges.push({ type: 'select', id, selected: true });
      }
    });
    if (nodeChanges.length > 0) {
      store.dispatch(nodesChanged(nodeChanges));
    }
    if (edgeChanges.length > 0) {
      store.dispatch(edgesChanged(edgeChanges));
    }
  }, [store]);
  useRegisteredHotkeys({
    id: 'selectAll',
    category: 'workflows',
    callback: selectAll,
    options: { enabled: isWorkflowsFocused && !isLocked, preventDefault: true },
    dependencies: [selectAll, isWorkflowsFocused, isLocked],
  });

  useRegisteredHotkeys({
    id: 'pasteSelection',
    category: 'workflows',
    callback: pasteSelection,
    options: { enabled: isWorkflowsFocused && !isLocked, preventDefault: true },
    dependencies: [pasteSelection, isLocked, isWorkflowsFocused],
  });

  useRegisteredHotkeys({
    id: 'pasteSelectionWithEdges',
    category: 'workflows',
    callback: pasteSelectionWithEdges,
    options: { enabled: isWorkflowsFocused && !isLocked, preventDefault: true },
    dependencies: [pasteSelectionWithEdges, isLocked, isWorkflowsFocused],
  });

  useRegisteredHotkeys({
    id: 'undo',
    category: 'workflows',
    callback: () => {
      store.dispatch(undo());
    },
    options: { enabled: isWorkflowsFocused && !isLocked && mayUndo, preventDefault: true },
    dependencies: [store, mayUndo, isLocked, isWorkflowsFocused],
  });

  useRegisteredHotkeys({
    id: 'redo',
    category: 'workflows',
    callback: () => {
      store.dispatch(redo());
    },
    options: { enabled: isWorkflowsFocused && !isLocked && mayRedo, preventDefault: true },
    dependencies: [store, mayRedo, isLocked, isWorkflowsFocused],
  });

  const onEscapeHotkey = useCallback(() => {
    if (!$edgePendingUpdate.get()) {
      $pendingConnection.set(null);
      $addNodeCmdk.set(false);
      cancelConnection();
    }
  }, [cancelConnection]);
  useHotkeys('esc', onEscapeHotkey);

  const deleteSelection = useCallback(() => {
    const { nodes, edges } = selectNodesSlice(store.getState());
    const nodeChanges: NodeChange<AnyNode>[] = [];
    const edgeChanges: EdgeChange<AnyEdge>[] = [];
    nodes
      .filter((n) => n.selected)
      .forEach(({ id }) => {
        nodeChanges.push({ type: 'remove', id });
      });
    edges
      .filter((e) => e.selected)
      .forEach(({ id }) => {
        edgeChanges.push({ type: 'remove', id });
      });
    if (nodeChanges.length > 0) {
      store.dispatch(nodesChanged(nodeChanges));
    }
    if (edgeChanges.length > 0) {
      store.dispatch(edgesChanged(edgeChanges));
    }
  }, [store]);
  useRegisteredHotkeys({
    id: 'deleteSelection',
    category: 'workflows',
    callback: deleteSelection,
    options: { preventDefault: true, enabled: isWorkflowsFocused && !isLocked },
    dependencies: [deleteSelection, isWorkflowsFocused, isLocked],
  });

  return null;
});
HotkeyIsolator.displayName = 'HotkeyIsolator';
