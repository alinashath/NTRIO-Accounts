import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard } from "@/components/design";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type { RoomDto } from "../../../../shared/types";

export function OccupancyRoomsPage() {
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch<{ items: RoomDto[] }>("/api/kitchen/rooms");
    setRooms(r.items);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/kitchen/rooms", {
        method: "POST",
        body: JSON.stringify({ number: newRoomNumber.trim() }),
      });
      setNewRoomNumber("");
      setAddOpen(false);
      setMsg("Room added");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteRoom(room: RoomDto) {
    if (!confirm(`Delete room ${room.number}?`)) return;
    try {
      await apiFetch(`/api/kitchen/rooms/${room.id}`, { method: "DELETE" });
      setMsg(`Room ${room.number} deleted`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Rooms</h1>
          <p className="mt-1 text-caption">Master room list for occupancy and kitchen</p>
        </div>
        <Button
          type="button"
          className="gap-2"
          aria-label="Add room"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add room
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard title="Rooms" caption={`${rooms.length} rooms`} href="/occupancy" linkLabel="Stay view">
        {rooms.map((r) => (
          <ListRow
            key={r.id}
            primary={`Room ${r.number}`}
            secondary="Master room list"
            right={
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                aria-label={`Delete room ${r.number}`}
                onClick={() => void deleteRoom(r)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
            }
          />
        ))}
        {!rooms.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            No rooms yet. Add your first room to start occupancy.
          </p>
        ) : null}
      </PanelCard>

      <Modal open={addOpen} title="Add room" onClose={() => setAddOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => void createRoom(e)}>
          <TextField
            label="Room number"
            value={newRoomNumber}
            onChange={(e) => setNewRoomNumber(e.target.value)}
            placeholder="107"
            required
          />
          <Button type="submit">Create room</Button>
        </form>
      </Modal>
    </div>
  );
}
