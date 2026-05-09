/**
 * Lucide icons for config schema `icon` string ids — shared by /config index and /config/[section].
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock,
  Code,
  Cpu,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Layers,
  ListTodo,
  Lock,
  MessageSquare,
  Mic,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Terminal,
  Volume2,
  Zap,
} from "lucide-react";

const CONFIG_ICON_MAP: Record<string, LucideIcon> = {
  Cpu,
  Globe,
  Activity,
  Layers,
  Terminal,
  Shield,
  Volume2,
  Mic,
  GitBranch,
  ListTodo,
  HardDrive,
  Zap,
  RotateCcw,
  FileText,
  ShieldCheck,
  Settings,
  ScrollText,
  MessageSquare,
  Clock,
  Lock,
  Code,
};

export function getConfigSectionIcon(iconName: string): LucideIcon {
  return CONFIG_ICON_MAP[iconName] ?? Settings;
}
