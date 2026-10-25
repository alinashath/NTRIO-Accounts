import { BedDouble, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { PanelCard } from "@/components/design";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import type { RoomDto, RoomStayDto } from "../../../../shared/types";
import { StayForm, todayYmd } from "./StayForm";

const CELL = 44;
const ROOM_COL = 72;

function ymdFromParts(y: number, m0: number, day: number) {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function monthLabel(y: number, m0: number) {
  return new Date(Date.UTC(y, m0, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysInMonth(y: number, m0: number) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

function stayOnDate(stay: RoomStayDto, ymd: string) {
  return stay.from_date <= ymd && ymd <= stay.to_date;
}

export function OccupancyCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [stays, setStays] = useState<RoomStayDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [stayOpen, setStayOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ roomId?: string; from?: string; to?: string }>({});
  const [selectedStay, setSelectedStay] = useState<RoomStayDto | null>(null);

  const monthStart = ymdFromParts(year, month0, 1);
  const monthEnd = ymdFromParts(year, month0, daysInMonth(year, month0));
  const dayCount = daysInMonth(year, month0);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => ymdFromParts(year, month0, i + 1)),
    [year, month0, dayCount],
  );

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      apiFetch<{ items: RoomDto[] }>("/api/kitchen/rooms"),
      apiFetch<{ items: RoomStayDto[] }>(
        `/api/kitchen/stays?from=${monthStart}&to=${monthEnd}`,
      ),
    ]);
    setRooms(r.items);
    setStays(s.items);
  }, [monthStart, monthEnd]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth0(d.getUTCMonth());
  }

  function openAddStay(roomId?: string, day?: string) {
    setPrefill({
      roomId,
      from: day,
      to: day,
    });
    setStayOpen(true);
  }

  async function deleteStay(stay: RoomStayDto) {
    if (!confirm(`Remove stay for room ${stay.room_number} (${stay.from_date} → ${stay.to_date})?`)) {
      return;
    }
    try {
      await apiFetch(`/api/kitchen/stays/${stay.id}`, { method: "DELETE" });
      setSelectedStay(null);
      setMsg("Stay removed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const today = todayYmd();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Occupancy</h1>
          <p className="mt-1 text-caption">Stay calendar · rooms filled by date range</p>
        </div>
        <Button type="button" className="gap-2" aria-label="Add stay" onClick={() => openAddStay()}>
          <Plus className="h-4 w-4" aria-hidden />
          Add stay
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard
        title="Stay view"
        caption={monthLabel(year, month0)}
        headerRight={
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-ink hover:bg-neutral-bg"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-ink hover:bg-neutral-bg"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        }
      >
        {!rooms.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            No rooms yet. Add rooms under Rooms, then add a stay.
          </p>
        ) : (
          <div className="border-t border-border overflow-x-auto">
            <div
              className="inline-block min-w-full"
              style={{ minWidth: ROOM_COL + dayCount * CELL }}
            >
              {/* Day headers */}
              <div className="flex border-b border-border bg-surface">
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface px-2 text-label"
                  style={{ width: ROOM_COL, minHeight: CELL }}
                >
                  Room
                </div>
                {days.map((d) => {
                  const dayNum = Number(d.slice(8, 10));
                  const isToday = d === today;
                  return (
                    <div
                      key={d}
                      className={`flex shrink-0 flex-col items-center justify-center border-r border-border text-caption tabular-nums ${
                        isToday ? "bg-neutral-bg font-semibold text-ink" : "text-muted-label"
                      }`}
                      style={{ width: CELL, minHeight: CELL }}
                      title={d}
                    >
                      <span>{dayNum}</span>
                    </div>
                  );
                })}
              </div>

              {rooms.map((room) => (
                <div key={room.id} className="flex border-b border-border last:border-b-0">
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface px-2 text-sm font-medium tabular-nums text-ink"
                    style={{ width: ROOM_COL, minHeight: CELL }}
                  >
                    {room.number}
                  </div>
                  {days.map((d) => {
                    const covering = stays.filter(
                      (s) => s.room_id === room.id && stayOnDate(s, d),
                    );
                    const stay = covering[0];
                    const filled = Boolean(stay);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-label={
                          filled
                            ? `Room ${room.number} ${d}: ${stay!.occupant_count} occupants`
                            : `Room ${room.number} ${d}: empty — add stay`
                        }
                        title={
                          filled
                            ? `${stay!.from_date} → ${stay!.to_date} · ${stay!.occupant_count}`
                            : "Add stay"
                        }
                        onClick={() => {
                          if (stay) setSelectedStay(stay);
                          else openAddStay(room.id, d);
                        }}
                        className={`flex shrink-0 items-center justify-center border-r border-border tabular-nums touch-manipulation ${
                          filled
                            ? "bg-ink text-sm font-semibold text-white hover:opacity-90"
                            : "bg-surface text-muted-label hover:bg-neutral-bg"
                        } ${d === today && !filled ? "ring-inset ring-1 ring-border" : ""}`}
                        style={{ width: CELL, minHeight: CELL }}
                      >
                        {filled ? stay!.occupant_count : ""}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="border-t border-border px-4 py-3 text-caption">
          Filled cells = occupied (number = guests). Tap empty to add stay · tap filled to manage.
        </p>
      </PanelCard>

      <PanelCard title="Stays this month" caption={`${stays.length} stay${stays.length === 1 ? "" : "s"}`}>
        {stays.map((s) => (
          <button
            key={s.id}
            type="button"
            className="flex w-full min-h-11 items-center justify-between gap-3 border-t border-border px-4 py-3 text-left touch-manipulation hover:bg-neutral-bg"
            onClick={() => setSelectedStay(s)}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Room {s.room_number}</span>
              <span className="mt-0.5 block text-caption">
                {s.from_date} → {s.to_date}
                {s.notes ? ` · ${s.notes}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
              {s.occupant_count}
            </span>
          </button>
        ))}
        {!stays.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            No stays in this month. Use Add stay to fill rooms on the calendar.
          </p>
        ) : null}
      </PanelCard>

      <Modal
        open={stayOpen}
        title="Add stay"
        onClose={() => setStayOpen(false)}
      >
        <StayForm
          rooms={rooms}
          initialRoomId={prefill.roomId}
          initialFrom={prefill.from}
          initialTo={prefill.to}
          onDone={(daysFilled) => {
            setStayOpen(false);
            setMsg(`Stay saved · ${daysFilled} date${daysFilled === 1 ? "" : "s"} filled`);
            void load().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal
        open={Boolean(selectedStay)}
        title={selectedStay ? `Room ${selectedStay.room_number}` : "Stay"}
        onClose={() => setSelectedStay(null)}
      >
        {selectedStay ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              <span className="font-semibold tabular-nums">
                {selectedStay.from_date} → {selectedStay.to_date}
              </span>
              <span className="mt-1 block text-caption">
                {selectedStay.occupant_count} occupant
                {selectedStay.occupant_count === 1 ? "" : "s"}
                {selectedStay.notes ? ` · ${selectedStay.notes}` : ""}
              </span>
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2 text-debit"
              onClick={() => void deleteStay(selectedStay)}
            >
              <BedDouble className="h-4 w-4" aria-hidden />
              Remove stay
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
