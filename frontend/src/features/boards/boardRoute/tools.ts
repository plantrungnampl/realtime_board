import {
  MousePointer2,
  MessageSquare,
  Square,
  Circle as CircleIcon,
  Pencil,
  Type,
  StickyNote,
  Image,
  Video,
  Layout,
  GitMerge,
  Link2,
  FileText,
  PenTool,
} from "lucide-react";

export const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "comment", icon: MessageSquare, label: "Comment", shortcut: "C" },
  { id: "shape:rectangle", icon: Square, label: "Rectangle", shortcut: "R" },
  { id: "shape:circle", icon: CircleIcon, label: "Circle", shortcut: "O" },
  { id: "frame", icon: Layout, label: "Frame", shortcut: "F" },
  { id: "connector", icon: GitMerge, label: "Connector", shortcut: "L" },
  { id: "drawing", icon: Pencil, label: "Draw", shortcut: "P" },
  { id: "text", icon: Type, label: "Text", shortcut: "T" },
  { id: "sticky_note", icon: StickyNote, label: "Sticky note", shortcut: "S" },
  { id: "image", icon: Image, label: "Image", shortcut: "I" },
  { id: "video", icon: Video, label: "Video" },
  { id: "embed", icon: Link2, label: "Embed" },
  { id: "document", icon: FileText, label: "Document", shortcut: "D" },
  { id: "component", icon: PenTool, label: "Component" },
] as const;

export type ToolType = (typeof TOOLS)[number]["id"];
