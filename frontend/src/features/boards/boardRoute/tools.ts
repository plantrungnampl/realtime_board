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
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "comment", icon: MessageSquare, label: "Comment" },
  { id: "shape:rectangle", icon: Square, label: "Rectangle" },
  { id: "shape:circle", icon: CircleIcon, label: "Circle" },
  { id: "frame", icon: Layout, label: "Frame" },
  { id: "connector", icon: GitMerge, label: "Connector" },
  { id: "drawing", icon: Pencil, label: "Draw" },
  { id: "text", icon: Type, label: "Text" },
  { id: "sticky_note", icon: StickyNote, label: "Sticky note" },
  { id: "image", icon: Image, label: "Image" },
  { id: "video", icon: Video, label: "Video" },
  { id: "embed", icon: Link2, label: "Embed" },
  { id: "document", icon: FileText, label: "Document" },
  { id: "component", icon: PenTool, label: "Component" },
] as const;

export type ToolType = (typeof TOOLS)[number]["id"];
