import { useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Dropdown } from "@/components/Dropdown";
import { Button, TextField } from "@/components/ui";
import type { RoomDto, RoomStayDto } from "../../../../shared/types";

export function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function StayForm({
  rooms,
  initialRoomId,
  initialFrom,
  initialTo,
  onDone,
  onError,
}: {
  rooms: RoomDto[];
  initialRoomId?: string;
  initialFrom?: string;
  initialTo?: string;
  onDone: (daysFilled: number) => void;
  onError: (s: string) => void;
}) {
  const [roomId, setRoomId] = useState(initialRoomId ?? rooms[0]?.id ?? "");
  const [fromDate, setFromDate] = useState(initialFrom ?? todayYmd());
  const [toDate, setToDate] = useState(initialTo ?? addDaysYmd(todayYmd(), 2));
  const [occupants, setOccupants] = useState("2");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!roomId && rooms[0]) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) {
      onError("Select a room");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<RoomStayDto>("/api/kitchen/stays", {
        method: "POST",
        body: JSON.stringify({
          room_id: roomId,
          from_date: fromDate,
          to_date: toDate,
          occupant_count: Number(occupants) || 1,
          notes: notes.trim() || null,
        }),
      });
      onDone(res.days_filled ?? 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Every date from–to inclusive is filled on the occupancy calendar and breakfast day board.
      </p>
      <Dropdown
        label="Room"
        value={roomId}
        onChange={setRoomId}
        options={rooms.map((r) => ({ value: r.id, label: `Room ${r.number}` }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
        <TextField label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
      </div>
      <TextField
        label="Occupants"
        type="number"
        min={1}
        max={10}
        value={occupants}
        onChange={(e) => setOccupants(e.target.value)}
        required
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" disabled={saving || !rooms.length}>
        {saving ? "Saving…" : "Save stay"}
      </Button>
    </form>
  );
}
