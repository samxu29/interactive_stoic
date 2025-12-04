import { useState, useEffect } from 'react';

/**
 * Custom hook for force-directed graph layout with collision resolution
 */
export const useForceLayout = (nodes, edges, width, height) => {
  // Init with default spread even if width/height are 0 initially
  // We use window.innerWidth as a fallback to ensure nodes aren't stacked at 0,0
  const initialWidth = width || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  const [layout, setLayout] = useState(nodes.map((n, i) => ({
    ...n, 
    x: initialWidth / 2 + (i % 2 === 0 ? 50 : -50), // Basic spread
    y: n.generation * 100
  })));

  useEffect(() => {
    // Height between generations
    const Y_SPACING = 180; 
    const safeWidth = width || initialWidth;
    
    // Group by generation
    const nodesByGen = {};
    nodes.forEach(n => {
        if(!nodesByGen[n.generation]) nodesByGen[n.generation] = [];
        nodesByGen[n.generation].push(n);
    });

    // 1. STRICT GRID INITIALIZATION
    // This ensures nodes start separate and stay separate horizontally.
    let currentNodes = nodes.map(n => {
        const genNodes = nodesByGen[n.generation];
        const index = genNodes.indexOf(n);
        const count = genNodes.length;
        
        // Distribute evenly across 200% of width (Wider Spread)
        const availableWidth = safeWidth * 3.0; // WIDER SPREAD
        const startX = safeWidth * -1.0; // Start off-screen left
        const xStep = availableWidth / (count + 1);
        
        // Calculate X: Center if only 1 node, otherwise spread
        let x;
        if (count === 1) {
            x = safeWidth / 2;
        } else {
            x = startX + xStep * (index + 1);
        }

        return {
            ...n, 
            x: x, 
            y: n.generation * Y_SPACING + 100, 
            vx: 0,
            vy: 0
        };
    });

    // 2. Physics Simulation 
    // We only use physics to "relax" the graph slightly, but we prevent overlap rigidly.
    const iterations = 120; 
    const k = 2000; // Repulsion
    const damping = 0.5;

    for (let i = 0; i < iterations; i++) {
        // Repulsion
        for (let a = 0; a < currentNodes.length; a++) {
            for (let b = a + 1; b < currentNodes.length; b++) {
                let dx = currentNodes[a].x - currentNodes[b].x;
                let dy = currentNodes[a].y - currentNodes[b].y;
                let distSq = dx * dx + dy * dy;
                let dist = Math.sqrt(distSq) || 1;
                
                // Increased repulsion range for wider spacing
                if (dist < 500 && Math.abs(dy) < 100) {
                    let force = k / (distSq + 50);
                    let fx = (dx / dist) * force;
                    currentNodes[a].vx += fx;
                    currentNodes[b].vx -= fx;
                }
            }
        }

        // Attraction (Edges) - Very weak, just to gently align parents/children
        edges.forEach(edge => {
            const source = currentNodes.find(n => n.id === edge.source);
            const target = currentNodes.find(n => n.id === edge.target);
            if (source && target) {
                let dx = target.x - source.x;
                let fx = dx * 0.015; // Minimal spring
                source.vx += fx;
                target.vx -= fx;
            }
        });

        // Update Position
        currentNodes.forEach(node => {
            node.x += node.vx;
            node.vx *= damping;
            // HARD CONSTRAINT: Y is locked.
            node.y = node.generation * Y_SPACING + 100; 
        });
    }

    // 3. MULTI-PASS COLLISION RESOLUTION (Iterative Spacing)
    // Run multiple times to propagate spacing through chains of nodes
    const COLLISION_PASSES = 3;
    const MIN_GAP = 450; // WIDE GAP GUARANTEE

    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
        Object.values(nodesByGen).forEach(genNodes => {
            // Re-find the updated node objects in currentNodes
            const currentGenNodes = currentNodes.filter(n => n.generation === genNodes[0].generation);
            
            currentGenNodes.sort((a, b) => a.x - b.x);
            
            for (let i = 0; i < currentGenNodes.length - 1; i++) {
                let n1 = currentGenNodes[i];
                let n2 = currentGenNodes[i+1];
                let dist = n2.x - n1.x;
                
                if (dist < MIN_GAP) {
                    const overlap = MIN_GAP - dist;
                    const push = overlap / 2;
                    n1.x -= push;
                    n2.x += push;
                }
            }
        });
    }

    setLayout(currentNodes);
  }, [nodes, edges, width]);

  return [layout, setLayout];
};

