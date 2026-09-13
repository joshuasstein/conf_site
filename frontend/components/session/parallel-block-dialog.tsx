"use client";

import { useEffect, useState } from "react";
import { sessionApi, type SessionGroupSummary, type SessionTypeDef } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the dialog edits this block's title/date/start; otherwise it creates one.
  block?: SessionGroupSummary | null;
  onSaved: () => void;
}

export function ParallelBlockDialog({ open, onOpenChange, block, onSaved }: Props) {
  const editing = !!block;
  const [saving, setSaving] = useState(false);
  const [sessionTypes, setSessionTypes] = useState<SessionTypeDef[]>([]);

  const [title, setTitle] = useState("");
  const [count, setCount] = useState("3");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [sessionType, setSessionType] = useState("");
  const [duration, setDuration] = useState("60");

  useEffect(() => {
    if (!open) return;
    if (editing && block) {
      setTitle(block.title ?? "");
      setDate(block.session_date);
      setStartTime(block.start_time.slice(0, 5));
    } else {
      setTitle("");
      setCount("3");
      setDate("");
      setStartTime("09:00");
      setDuration("60");
    }
    // Session types are only needed for creation.
    if (!editing) {
      sessionApi
        .conferenceInfo()
        .then((info) => {
          const types = (info.session_types ?? []).filter((t) => t.has_slots !== false);
          setSessionTypes(types);
          setSessionType((prev) => prev || types[0]?.key || "oral");
        })
        .catch(() => setSessionType((prev) => prev || "oral"));
    }
  }, [open, editing, block]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing && block) {
        await sessionApi.updateGroup(block.id, {
          title: title.trim() || undefined,
          session_date: date,
          start_time: startTime,
        });
        toast({ title: "Saved", description: "Parallel block updated." });
      } else {
        const n = parseInt(count, 10);
        if (!Number.isFinite(n) || n < 2) {
          toast({ title: "Error", description: "Enter at least 2 parallel sessions.", variant: "destructive" });
          setSaving(false);
          return;
        }
        await sessionApi.createParallelBlock({
          count: n,
          session_date: date,
          start_time: startTime,
          session_type: sessionType,
          default_duration_minutes: parseInt(duration, 10) || 60,
          title: title.trim() || undefined,
        });
        toast({ title: "Created", description: `${n} parallel sessions created.` });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!date && !!startTime && (editing || (!!sessionType && parseInt(count, 10) >= 2));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit parallel block" : "New parallel block"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "All columns share this date and start time. Edit each column's name, type, room, duration and abstracts from its own page."
              : "Creates several sessions that run at the same time in different rooms. You'll name and fill in each one afterwards."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label htmlFor="pb-title">Block title (optional)</Label>
            <Input
              id="pb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Technical Tracks"
            />
          </div>

          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pb-count">Number of parallel sessions</Label>
                <Input
                  id="pb-count"
                  type="number"
                  min={2}
                  max={12}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pb-duration">Default duration (min)</Label>
                <Input
                  id="pb-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pb-date">Date</Label>
              <Input id="pb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pb-start">Start time</Label>
              <Input id="pb-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>

          {!editing && (
            <div>
              <Label htmlFor="pb-type">Session type (applied to each column)</Label>
              <Select value={sessionType} onValueChange={setSessionType}>
                <SelectTrigger id="pb-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {sessionTypes.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                You can change any column&apos;s type, duration, room and name afterwards.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSave} loading={saving}>
            {editing ? "Save changes" : "Create block"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
