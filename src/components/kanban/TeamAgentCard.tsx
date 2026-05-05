// ═══════════════════════════════════════════════════════════════
// TeamAgentCard — Shows a team member with profile info and status
// ═══════════════════════════════════════════════════════════════

"use client";

import { User, Crown, Shield, Eye, Wrench } from "lucide-react";
import type { TeamMember } from "@/types/hermes";

interface Props {
  member: TeamMember;
  profileName?: string;
  profileDescription?: string;
  skillsCount?: number;
  isLeader?: boolean;
  onClick?: () => void;
}

const ROLE_ICONS = {
  leader: Crown,
  specialist: Wrench,
  reviewer: Shield,
  observer: Eye,
};

const ROLE_COLORS = {
  leader: "text-neon-yellow",
  specialist: "text-neon-purple",
  reviewer: "text-neon-cyan",
  observer: "text-white/40",
};

export default function TeamAgentCard({
  member,
  profileName,
  profileDescription,
  skillsCount = 0,
  isLeader = false,
  onClick,
}: Props) {
  const RoleIcon = ROLE_ICONS[member.role];
  const roleColor = ROLE_COLORS[member.role];

  return (
    <div
      className={`group rounded-xl border p-4 cursor-pointer hover:bg-white/5 transition-colors
        ${isLeader ? "border-neon-yellow/30 bg-neon-yellow/5" : "border-white/10 bg-white/5"}`}
      onClick={onClick}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
            ${isLeader ? "bg-neon-yellow/10 border border-neon-yellow/30" : "bg-white/10"}`}
        >
          <User className={`w-4 h-4 ${isLeader ? "text-neon-yellow" : "text-white/50"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {profileName ?? member.profileId}
          </p>
          {profileDescription && (
            <p className="text-xs text-white/40 truncate">{profileDescription}</p>
          )}
        </div>
      </div>

      {/* Role + skills */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <RoleIcon className={`w-3.5 h-3.5 ${roleColor}`} />
          <span className={`text-[11px] capitalize ${roleColor}`}>{member.role}</span>
        </div>
        {skillsCount > 0 && (
          <span className="text-[11px] text-white/30 font-mono">
            {skillsCount} skill{skillsCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Joined date */}
      <p className="text-[10px] text-white/20 mt-2">
        Joined {new Date(member.joinedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
