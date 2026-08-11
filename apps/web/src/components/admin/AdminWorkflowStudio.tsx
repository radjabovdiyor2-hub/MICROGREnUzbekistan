'use client';

import { useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function AdminWorkflowStudio() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWorkflows() {
      try {
        const res = await fetch('/api/admin/workflow');
        const data = await res.json();
        
        if (data.success && data.workflows) {
          const newNodes: Node[] = [];
          const newEdges: Edge[] = [];
          
          let yOffset = 50;
          
          Object.entries(data.workflows).forEach(([workflowName, steps]) => {
            let xOffset = 50;
            
            // Add a group node for the workflow
            newNodes.push({
              id: workflowName,
              data: { label: workflowName.toUpperCase() },
              position: { x: 20, y: yOffset - 40 },
              style: { backgroundColor: 'var(--bg-secondary)', width: 800, height: 200, zIndex: -1 },
              type: 'group'
            });
            
            // Process steps
            const stepMap = steps as Record<string, { bot?: string, next?: string }>;
            Object.entries(stepMap).forEach(([stepName, config]) => {
              const nodeId = `${workflowName}-${stepName}`;
              
              newNodes.push({
                id: nodeId,
                parentId: workflowName,
                extent: 'parent',
                position: { x: xOffset, y: 50 },
                data: { 
                  label: (
                    <div style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 'bold' }}>{stepName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Bot: {config.bot}</div>
                    </div>
                  ) 
                },
                style: { border: '2px solid var(--brand-primary)', borderRadius: '8px', background: 'var(--bg-primary)' }
              });
              
              if (config.next && config.next !== 'done') {
                newEdges.push({
                  id: `e-${nodeId}-${workflowName}-${config.next}`,
                  source: nodeId,
                  target: `${workflowName}-${config.next}`,
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--brand-primary)' },
                  style: { stroke: 'var(--brand-primary)' }
                });
              }
              
              xOffset += 200;
            });
            
            yOffset += 250;
          });
          
          setNodes(newNodes);
          setEdges(newEdges);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadWorkflows();
  }, [setNodes, setEdges]);

  return (
    <div style={{ height: 'calc(100vh - 100px)', padding: 'var(--space-4)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Visual Workflow Studio</h1>
        <p style={{ color: 'var(--text-muted)' }}>Graflarni vizual tahrirlash (DAG Orchestrator)</p>
      </div>
      
      <div style={{ height: 'calc(100% - 80px)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            Loading...
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
