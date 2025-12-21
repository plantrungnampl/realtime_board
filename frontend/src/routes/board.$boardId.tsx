import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Circle,
  Rect,
  Line,
  Text as KonvaText,
  Group,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useAppStore } from "@/store/useAppStore";
import type { CursorBroadcast, BoardElement } from "@/types/board";
import { getBoardsList } from "@/lib/api";
import {
  MousePointer2,
  Square,
  Circle as CircleIcon,
  Pencil,
  Type,
  Undo2,
  Redo2,
  Share2,
  ChevronLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export const Route = createFileRoute("/board/$boardId")({
  component: BoardComponent,
});

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "shape:rectangle", icon: Square, label: "Rectangle" },
  { id: "shape:circle", icon: CircleIcon, label: "Circle" },
  { id: "drawing", icon: Pencil, label: "Draw" },
  { id: "text", icon: Type, label: "Text" },
] as const;

type ToolType = (typeof TOOLS)[number]["id"];

function BoardComponent() {
  const { boardId } = Route.useParams();
  const { user, isAuthenticated } = useAppStore();
  const navigate = useNavigate();

  // Board State
  const [boardTitle, setBoardTitle] = useState("Untitled Board");
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [tool, setTool] = useState<ToolType>("select");
  const [action, setAction] = useState<"none" | "drawing" | "moving">("none");

  // Realtime State
  const [cursors, setCursors] = useState<Record<string, CursorBroadcast>>({});

  // Yjs Refs
  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  // Canvas State
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Temporary drawing state
  const currentShapeId = useRef<string | null>(null);

  // Auth & Board Info
  useEffect(() => {
    if (!isAuthenticated) {
      if (!localStorage.getItem("token")) {
        navigate({ to: "/login" });
      }
    }

    getBoardsList()
      .then((boards) => {
        const currentBoard = boards.find((b) => b.id.toString() === boardId);
        if (currentBoard) {
          setBoardTitle(currentBoard.name);
        }
      })
      .catch(console.error);
  }, [isAuthenticated, navigate, boardId]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Yjs & WebSocket Setup
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Initialize Yjs Doc
    const doc = new Y.Doc();
    yDocRef.current = doc;

    // Connect to Websocket Provider
    // Using a specific room name for the board
    const wsUrl = "ws://localhost:3000/ws/yjs"; // Assuming Yjs endpoint
    const provider = new WebsocketProvider(wsUrl, `board-${boardId}`, doc, {
      params: { token },
    });
    providerRef.current = provider;

    // Elements Map (using Y.Map for ID-based lookups)
    const yElements = doc.getMap<BoardElement>("elements");

    // Sync initial state
    setElements(Array.from(yElements.values()));

    // Listen for changes
    yElements.observe(() => {
      setElements(Array.from(yElements.values()));
    });

    // Awareness (Cursors)
    const awareness = provider.awareness;

    // Set local user state
    if (user) {
      awareness.setLocalState({
        user: {
          name: user.display_name,
          color: "#EAB308", // Yellow
          id: user.id,
        },
        x: 0,
        y: 0,
      });
    }

    awareness.on("change", () => {
      const newCursors: Record<string, CursorBroadcast> = {};
      awareness.getStates().forEach((state, clientId) => {
        if (
          clientId !== awareness.clientID &&
          state.user &&
          state.x != null &&
          state.y != null
        ) {
          // Use user.id as key if available, otherwise clientId
          const key = state.user.id || clientId.toString();
          newCursors[key] = {
            user_id: state.user.name || "Anonymous", // Mapping name to user_id for display
            x: state.x,
            y: state.y,
          };
        }
      });
      setCursors(newCursors);
    });

    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [boardId, user]);

  // Update cursor position in Awareness
  const broadcastCursor = (x: number, y: number) => {
    const provider = providerRef.current;
    if (provider) {
      provider.awareness.setLocalStateField("x", x);
      provider.awareness.setLocalStateField("y", y);
    }
  };

  // Drawing Handlers
  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (action === "drawing") return;

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = pos;

    if (tool === "select") return;

    const id = crypto.randomUUID();
    currentShapeId.current = id;
    setAction("drawing");

    let newElement: BoardElement | null = null;

    if (tool === "shape:rectangle") {
      newElement = {
        id,
        board_id: boardId,
        element_type: "Shape",
        position_x: x,
        position_y: y,
        width: 1,
        height: 1,
        style: { stroke: "#ffffff", strokeWidth: 2, fill: "transparent" },
        properties: { shapeType: "rectangle" },
      };
    } else if (tool === "shape:circle") {
      newElement = {
        id,
        board_id: boardId,
        element_type: "Shape",
        position_x: x,
        position_y: y,
        width: 1,
        height: 1,
        style: { stroke: "#ffffff", strokeWidth: 2, fill: "transparent" },
        properties: { shapeType: "circle" },
      };
    } else if (tool === "drawing") {
      newElement = {
        id,
        board_id: boardId,
        element_type: "Drawing",
        position_x: 0,
        position_y: 0,
        width: 1,
        height: 1,
        style: { stroke: "#EAB308", strokeWidth: 3 },
        properties: { points: [x, y] },
      };
    } else if (tool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        newElement = {
          id,
          board_id: boardId,
          element_type: "Text",
          position_x: x,
          position_y: y,
          width: 1,
          height: 1,
          style: { fontSize: 20, fill: "#ffffff" },
          properties: { content: text },
        };

        // Add to Yjs Map
        if (yDocRef.current) {
          const yElements = yDocRef.current.getMap<BoardElement>("elements");
          yElements.set(id, newElement);
        }
      }
      setAction("none");
      return;
    }

    if (newElement) {
      // Add to Yjs Map
      if (yDocRef.current) {
        const yElements = yDocRef.current.getMap<BoardElement>("elements");
        yElements.set(id, newElement);
      }
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const { x, y } = pos;

    broadcastCursor(x, y);

    if (action === "drawing" && currentShapeId.current) {
      // We read from local elements for performance, but ultimately update Yjs
      const currentElement = elements.find(
        (el) => el.id === currentShapeId.current,
      );
      if (!currentElement) return;

      let updatedElement: BoardElement;

      // Type narrowing via discriminated union
      if (currentElement.element_type === "Shape") {
        updatedElement = {
          ...currentElement,
          width: x - currentElement.position_x,
          height: y - currentElement.position_y,
        };
      } else if (currentElement.element_type === "Drawing") {
        const newPoints = [...(currentElement.properties.points || []), x, y];
        updatedElement = {
          ...currentElement,
          properties: {
            ...currentElement.properties,
            points: newPoints,
          },
        };
      } else {
        // Text or other types don't update on drag currently
        return;
      }

      // Update Yjs Map
      if (yDocRef.current) {
        const yElements = yDocRef.current.getMap<BoardElement>("elements");
        yElements.set(currentElement.id, updatedElement);
      }
    }
  };

  const handleMouseUp = () => {
    setAction("none");
    currentShapeId.current = null;
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: "/" })}
            className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-neutral-200">{boardTitle}</h1>
            <p className="text-xs text-neutral-500">Last saved just now</p>
          </div>
        </div>

        {/* Toolbar - Center */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 bg-neutral-800 border border-neutral-700 p-1 rounded-xl flex items-center gap-1 shadow-xl">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={cn(
                "p-2 rounded-lg transition-all",
                tool === t.id
                  ? "bg-yellow-500 text-neutral-900 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700",
              )}
              title={t.label}
            >
              <t.icon className="w-5 h-5" />
            </button>
          ))}
          <div className="w-px h-6 bg-neutral-700 mx-1" />
          <button className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700">
            <Undo2 className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700">
            <Redo2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {Object.values(cursors)
              .slice(0, 3)
              .map((cursor) => (
                <div
                  key={cursor.user_id}
                  className="w-8 h-8 rounded-full bg-neutral-700 border-2 border-neutral-900 flex items-center justify-center text-xs text-neutral-300"
                >
                  {cursor.user_id.slice(0, 2)}
                </div>
              ))}
            {Object.keys(cursors).length > 3 && (
              <div className="w-8 h-8 rounded-full bg-neutral-800 border-2 border-neutral-900 flex items-center justify-center text-xs text-neutral-400">
                +{Object.keys(cursors).length - 3}
              </div>
            )}
          </div>
          <button className="bg-yellow-500 hover:bg-yellow-400 text-neutral-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </button>
          <Avatar className="w-9 h-9 border-2 border-neutral-800">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="bg-blue-600 text-white">
              {user?.display_name?.slice(0, 2).toUpperCase() || "ME"}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative cursor-crosshair">
        <Stage
          width={dimensions.width}
          height={dimensions.height - 56}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            <Rect
              width={dimensions.width}
              height={dimensions.height}
              fill="#171717"
            />

            {elements.map((el) => {
              if (el.element_type === "Shape") {
                if (el.properties.shapeType === "rectangle") {
                  return (
                    <Rect
                      key={el.id}
                      x={el.position_x}
                      y={el.position_y}
                      width={el.width}
                      height={el.height}
                      stroke={el.style.stroke}
                      strokeWidth={el.style.strokeWidth}
                      fill={el.style.fill}
                    />
                  );
                } else if (el.properties.shapeType === "circle") {
                  const radius = Math.sqrt(
                    Math.pow(el.width || 0, 2) + Math.pow(el.height || 0, 2),
                  );
                  return (
                    <Circle
                      key={el.id}
                      x={el.position_x}
                      y={el.position_y}
                      radius={radius}
                      stroke={el.style.stroke}
                      strokeWidth={el.style.strokeWidth}
                      fill={el.style.fill}
                    />
                  );
                }
              } else if (el.element_type === "Drawing") {
                return (
                  <Line
                    key={el.id}
                    points={el.properties.points}
                    stroke={el.style.stroke}
                    strokeWidth={el.style.strokeWidth}
                    lineCap="round"
                    lineJoin="round"
                  />
                );
              } else if (el.element_type === "Text") {
                return (
                  <KonvaText
                    key={el.id}
                    x={el.position_x}
                    y={el.position_y}
                    text={el.properties.content || ""}
                    fontSize={el.style.fontSize}
                    fill={el.style.fill}
                  />
                );
              }
              return null;
            })}

            {Object.values(cursors).map((cursor) => (
              <Group key={cursor.user_id} x={cursor.x} y={cursor.y}>
                <Circle
                  radius={4}
                  fill="#EAB308"
                  stroke="#171717"
                  strokeWidth={1}
                />
                <KonvaText
                  text={cursor.user_id.slice(0, 4)}
                  y={10}
                  x={-10}
                  fill="#EAB308"
                  fontSize={10}
                />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
