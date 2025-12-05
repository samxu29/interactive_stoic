import React, { useState, useEffect, useRef } from 'react';
import { Search, ZoomIn, ZoomOut, BookOpen, X, Sword, ExternalLink, Anchor, MousePointer2 } from 'lucide-react';
import DB from './database.json';
import { useForceLayout } from './layout';

const { nodes: INITIAL_NODES, edges: INITIAL_EDGES } = DB;

export default function InteractiveStoic() {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useForceLayout(INITIAL_NODES, INITIAL_EDGES, dimensions.w, dimensions.h);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeImage, setNodeImage] = useState(null); // High-res for detail view
  const [nodeThumbnails, setNodeThumbnails] = useState({}); // Low-res for graph
  const [hoveredNode, setHoveredNode] = useState(null); // NEW STATE FOR HOVER
  const [draggingId, setDraggingId] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewState, setViewState] = useState({ scale: 0.6, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if(containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = containerRef.current.offsetHeight;
        setDimensions({ w, h });
        // Center the view initially
        setViewState({ scale: 0.6, x: w/2 - 600, y: 0 });
    }
  }, []);

  // Fetch thumbnails for graph nodes
  useEffect(() => {
    const nodesWithWiki = INITIAL_NODES.filter(n => n.wiki);
    if (nodesWithWiki.length === 0) return;

    // Chunk requests if necessary (max 50 titles per request)
    const titles = nodesWithWiki.map(n => n.wiki.split('/').pop());
    const uniqueTitles = [...new Set(titles)]; // Dedup just in case
    
    // Simple implementation assuming < 50 nodes with wiki
    const titleString = uniqueTitles.join('|');

    fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${titleString}&prop=pageimages&format=json&pithumbsize=100&origin=*`)
      .then(res => res.json())
      .then(data => {
        if (!data.query || !data.query.pages) return;
        
        const newThumbnails = {};
        Object.values(data.query.pages).forEach(page => {
           if (page.thumbnail) {
               // Find the matching node
               // API returns titles with spaces, our DB has underscores
               const match = nodesWithWiki.find(n => {
                   const dbTitle = decodeURIComponent(n.wiki.split('/').pop()).replace(/_/g, ' ');
                   return dbTitle === page.title;
               });
               
               if (match) {
                   newThumbnails[match.id] = page.thumbnail.source;
               }
           }
        });
        setNodeThumbnails(newThumbnails);
      })
      .catch(err => console.error("Failed to fetch thumbnails", err));
  }, []);

  useEffect(() => {
    if (selectedNode && selectedNode.wiki) {
      setNodeImage(null);
      const title = selectedNode.wiki.split('/').pop();
      fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=500&origin=*`)
        .then(res => res.json())
        .then(data => {
          const pages = data.query.pages;
          const pageId = Object.keys(pages)[0];
          if (pages[pageId].thumbnail) {
            setNodeImage(pages[pageId].thumbnail.source);
          }
        })
        .catch(err => console.error("Failed to fetch image", err));
    } else {
      setNodeImage(null);
    }
  }, [selectedNode]);

  const focusOnNode = (node) => {
    setSelectedNode(node);
  };

  const handleNodeMouseDown = (e, id, x, y) => {
    e.stopPropagation();
    setDraggingId(id);
    setOffset({ x: e.clientX / viewState.scale - x, y: e.clientY / viewState.scale - y });
  };

  const handleMouseMove = (e) => {
    if (draggingId) {
       const newX = e.clientX / viewState.scale - offset.x;
       const newY = e.clientY / viewState.scale - offset.y;
       setNodes(prev => prev.map(n => n.id === draggingId ? { ...n, x: newX, y: newY } : n));
    } else if (isPanning) {
       const dx = e.clientX - panStart.x;
       const dy = e.clientY - panStart.y;
       setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
       setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setDraggingId(null);
    setIsPanning(false);
  };

  const handleCanvasMouseDown = (e) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const query = e.target.search.value.toLowerCase();
    if (!query) return;
    
    // Check if nodes are loaded
    if (!nodes || nodes.length === 0) return;

    const found = nodes.find(n => n.label.toLowerCase().includes(query));
    if (found) {
        focusOnNode(found);
    }
  };

  const getNodeColor = (type) => {
    switch(type) {
        case 'root': return 'bg-gray-200 border-gray-400 text-slate-900';
        case 'cynic': return 'bg-stone-200 border-stone-400 text-slate-900';
        case 'academy': return 'bg-yellow-50 border-yellow-300 text-slate-900';
        case 'stoic': return 'bg-blue-100 border-blue-400 text-slate-900';
        case 'rival': return 'bg-red-50 border-red-300 border-dashed text-slate-900';
        case 'roman': return 'bg-purple-100 border-purple-400 text-slate-900';
        case 'modern': return 'bg-emerald-100 border-emerald-400 text-slate-900';
        case 'renegade': return 'bg-gray-700 border-gray-900 text-white';
        default: return 'bg-white border-gray-300 text-slate-900';
    }
  };

  const getCurvePath = (x1, y1, x2, y2) => {
      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  };

  // NEW: Handler for clicking edges
  const handleEdgeClick = (edge) => {
      if (!selectedNode) return;
      
      // Navigate to the node on the *other* side of the connection
      const nextNodeId = selectedNode.id === edge.source ? edge.target : edge.source;
      const nextNode = nodes.find(n => n.id === nextNodeId);
      
      if (nextNode) {
          focusOnNode(nextNode);
      }
  };

  const handleWheel = (e) => {
    // e.preventDefault(); // React synthetic events don't strictly require this for wheel usually, but good practice if attached natively
    
    const scaleSensitivity = 0.001;
    const delta = -e.deltaY * scaleSensitivity;
    
    // Limit zoom range
    const newScale = Math.min(Math.max(0.1, viewState.scale + delta), 4);
    
    // Calculate cursor position relative to the container
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Calculate world coordinates of the cursor (before zoom)
    const worldX = (cursorX - viewState.x) / viewState.scale;
    const worldY = (cursorY - viewState.y) / viewState.scale;

    // Calculate new pan to keep world coordinates under cursor
    const newX = cursorX - (worldX * newScale);
    const newY = cursorY - (worldY * newScale);

    setViewState({
        scale: newScale,
        x: newX,
        y: newY
    });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50 overflow-hidden font-sans text-slate-900"
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
        
        {/* Toolbar */}
        <div className="bg-white border-b px-4 py-3 flex justify-between items-center shadow-sm z-20">
            <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white p-2 rounded">
                    <BookOpen size={20} />
                </div>
                <div>
                    <h1 className="font-serif font-bold text-lg">interactive_stoic</h1>
                    <p className="text-xs text-slate-500">Drag to rearrange • Scroll to zoom • Click highlighted lines to jump</p>
                </div>
            </div>
            <div className="flex gap-2">
                <form onSubmit={handleSearch}>
                    <input name="search" placeholder="Search..." className="bg-slate-100 px-3 py-1 rounded-full text-sm border focus:border-blue-500 outline-none" />
                </form>
                <div className="flex bg-slate-100 rounded">
                    <button onClick={() => setViewState(p => ({...p, scale: p.scale - 0.1}))} className="p-2 hover:bg-white"><ZoomOut size={16}/></button>
                    <button onClick={() => setViewState(p => ({...p, scale: p.scale + 0.1}))} className="p-2 hover:bg-white"><ZoomIn size={16}/></button>
                </div>
            </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative cursor-grab active:cursor-grabbing bg-dot-pattern"
             ref={containerRef}
             onMouseDown={handleCanvasMouseDown}
             onWheel={handleWheel}
        >
            <div style={{ 
                transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`,
                transformOrigin: '0 0',
                width: '100%', height: '100%',
                cursor: selectedNode ? 'default' : 'grab' // Indicate mode
            }}>
                <svg className="absolute top-0 left-0 overflow-visible pointer-events-none w-full h-full">
                    {/* Draw Edges as Bezier Curves */}
                    {INITIAL_EDGES.map((edge, i) => {
                        // Check if nodes are ready
                        if (!nodes || nodes.length === 0) return null;

                        const source = nodes.find(n => n.id === edge.source);
                        const target = nodes.find(n => n.id === edge.target);
                        if (!source || !target) return null;
                        
                        const isRival = edge.type === 'rival';
                        const isInfluence = edge.type === 'influence'; // Dashed
                        const isDotted = edge.type === 'dotted'; // Legacy
                        const isDashed = isRival || isInfluence || isDotted;
                        
                        // NEW LOGIC: Visibility based on SELECTION primarily
                        const isConnectedToSelected = selectedNode && (selectedNode.id === source.id || selectedNode.id === target.id);
                        const isConnectedToHovered = hoveredNode && (hoveredNode.id === source.id || hoveredNode.id === target.id);
                        
                        // "Active" means highlighted. "Clickable" means connected to the currently READ card.
                        const isHighlighted = isConnectedToSelected || isConnectedToHovered;
                        const isClickable = isConnectedToSelected;
                        
                        // Dim everything else if there is a focus
                        const isGlobalDim = (selectedNode || hoveredNode) && !isHighlighted;
                        
                        // Colors
                        let strokeColor = isRival ? '#fca5a5' : '#cbd5e1';
                        if (isHighlighted) {
                            strokeColor = isRival ? '#ef4444' : '#3b82f6';
                        }

                        // Opacity - clearer faint lines
                        const opacity = isGlobalDim ? 0.6 : (isHighlighted ? 1 : 0.6); 
                        const width = isHighlighted ? 3 : (isRival ? 1.5 : 2);
                        
                        let x1, y1, x2, y2;
                        const isSameGen = source.generation === target.generation;
                        
                        if (isRival && isSameGen) {
                            // Side to Side for contemporaries
                            if (source.x < target.x) {
                                x1 = source.x + 70; // Right of source
                                x2 = target.x - 70; // Left of target
                            } else {
                                x1 = source.x - 70; // Left of source
                                x2 = target.x + 70; // Right of target
                            }
                            y1 = source.y;
                            y2 = target.y;
                        } else {
                            // Top to Bottom (Default)
                            x1 = source.x;
                            y1 = source.y + 25;
                            x2 = target.x;
                            y2 = target.y - 25;
                        }
                        
                        const pathD = getCurvePath(x1, y1, x2, y2);

                        return (
                            <g key={i} 
                               style={{ opacity, transition: 'opacity 0.2s', pointerEvents: isClickable ? 'all' : 'none' }} 
                               onClick={(e) => {
                                   e.stopPropagation();
                                   if (isClickable) handleEdgeClick(edge);
                               }}
                               className={isClickable ? "cursor-pointer group" : ""}
                            >
                                {/* Invisible wide path for easier clicking */}
                                <path 
                                    d={pathD}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={20}
                                />
                                {/* Visible path */}
                                <path 
                                    d={pathD}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth={width}
                                    strokeDasharray={isDashed ? "5,5" : "none"}
                                    className="transition-all duration-200 group-hover:stroke-[4px]"
                                />
                                {edge.label && isHighlighted && (
                                    <text x={(source.x + target.x)/2} y={(source.y + target.y)/2}
                                        fill="#1e293b" fontSize="12" fontWeight="bold" textAnchor="middle" 
                                        className="bg-white/90 px-1 py-0.5 rounded border border-gray-200">
                                        {edge.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Draw Nodes */}
                {nodes && nodes.map(node => (
                    <div
                        key={node.id}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id, node.x, node.y)}
                        onClick={(e) => {
                            e.stopPropagation();
                            focusOnNode(node);
                        }}
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                        className={`absolute flex flex-col items-center justify-center p-2 rounded-lg shadow-md border-2 transition-all hover:shadow-xl cursor-pointer select-none
                            ${getNodeColor(node.type)}
                            ${selectedNode?.id === node.id ? 'ring-4 ring-offset-2 ring-blue-500 scale-110 z-50' : 'z-10'}
                            ${hoveredNode && hoveredNode.id !== node.id && selectedNode?.id !== node.id ? 'opacity-40 grayscale' : 'opacity-100'} 
                        `}
                        style={{
                            left: node.x, top: node.y, width: 160, height: 70,
                            transform: 'translate(-50%, -50%)',
                            transition: 'opacity 0.2s, filter 0.2s, transform 0.2s'
                        }}
                    >
                        <div className="flex items-center gap-2 w-full">
                            {nodeThumbnails[node.id] ? (
                                <img 
                                    src={nodeThumbnails[node.id]} 
                                    alt="" 
                                    className="w-10 h-10 rounded-full object-cover border border-gray-300 shrink-0 bg-gray-100"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center shrink-0">
                                    <span className="text-xs text-gray-400 font-serif">{node.label[0]}</span>
                                </div>
                            )}
                            
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1">
                                    {node.type === 'rival' && <Sword size={12} className="text-red-500 shrink-0"/>}
                                    <span className="font-bold text-xs leading-tight truncate">{node.label}</span>
                                </div>
                                <span className={`text-[10px] ${node.type === 'renegade' ? 'text-gray-300' : 'text-gray-500'} truncate`}>
                                    {node.date}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur p-3 rounded-xl border shadow-lg text-xs pointer-events-none z-30">
            <h4 className="font-bold mb-2 text-slate-400 uppercase">Key</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-gray-200"></div> Socratic</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-stone-200"></div> Cynic</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-blue-100"></div> Stoic</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-red-100 border border-red-300 border-dashed"></div> Rival</div>
                <div className="flex items-center gap-2"><div className="w-8 h-0 border-b-2 border-slate-300"></div> Student</div>
                <div className="flex items-center gap-2"><div className="w-8 h-0 border-b-2 border-slate-300 border-dashed"></div> Influence</div>
            </div>
        </div>

        {/* Info Panel */}
        {selectedNode && (
            <div className="absolute right-0 top-14 bottom-0 w-96 bg-white shadow-2xl border-l z-40 flex flex-col transform transition-transform">
                <div className="p-6 border-b bg-white flex-shrink-0">
                    <div className="flex justify-between items-start mb-2">
                        <h2 className="text-xl font-serif font-bold">{selectedNode.label}</h2>
                        <button onClick={() => setSelectedNode(null)} className="hover:bg-gray-100 p-1 rounded-full"><X size={20}/></button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <span className="inline-block px-2 py-1 text-xs font-semibold bg-gray-100 rounded uppercase tracking-wide">
                                {selectedNode.type}
                            </span>
                            <span className="text-sm text-gray-500 font-mono">{selectedNode.date}</span>
                        </div>
                        
                        {selectedNode.wiki && (
                            <a 
                                href={selectedNode.wiki} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                            >
                                <ExternalLink size={12} />
                                Read on Wikipedia
                            </a>
                        )}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-4">
                        {nodeImage && (
                            <div className="mb-4">
                                 <img 
                                    src={nodeImage} 
                                    alt={selectedNode.label} 
                                    className="w-full h-auto max-h-64 object-cover rounded-lg shadow-sm"
                                 />
                            </div>
                        )}

                        <hr className="border-gray-100"/>
                        
                        {/* Render Structured Sections */}
                        {selectedNode.sections && selectedNode.sections.map((section, idx) => (
                            <div key={idx} className="mb-4">
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-1">
                                    {section.title}
                                </h3>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {section.content}
                                </p>
                            </div>
                        ))}
                        
                        {/* Fallback for legacy desc string if any */}
                        {selectedNode.desc && !selectedNode.sections && (
                             <div className="text-gray-700 leading-relaxed text-sm whitespace-pre-wrap">
                                {selectedNode.desc}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <style>{`
            .bg-dot-pattern {
                background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
                background-size: 20px 20px;
            }
        `}</style>
    </div>
  );
}