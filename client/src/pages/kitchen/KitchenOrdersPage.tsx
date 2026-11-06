import { Apple, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type {
  BreakfastOptionDto,
  BreakfastOrderDto,
  BreakfastType,
  EggStyle,
  KitchenDayDto,
  KitchenDayRoomDto,
  MealPeriod,
  RoomDayExtrasDto,
  RoomExtraOptionDto,
  RoomExtraSelectionDto,
  ShoppingSummaryDto,
} from "../../../../shared/types";

const MEAL_TABS: { value: MealPeriod; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

function emptyExtras(meal: MealPeriod): RoomDayExtrasDto {
  return {
    id: null,
    meal_period: meal,
    fruits: [],
    selected_item_ids: [],
    selected_lines: [],
    pancake: false,
    honey: false,
    nutella: false,
    cereal: false,
    water_bottle: false,
  };
}

function extrasForMeal(room: KitchenDayRoomDto, meal: MealPeriod): RoomDayExtrasDto {
  return room.extras_by_meal?.[meal] ?? (meal === "breakfast" ? room.extras : emptyExtras(meal));
}

function mealTitle(meal: MealPeriod) {
  return meal === "breakfast" ? "Breakfast" : meal === "lunch" ? "Lunch" : "Dinner";
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const fruitOpts = [
  { id: "watermelon", label: "Water Melon" },
  { id: "apple", label: "Apple" },
  { id: "papaya", label: "Papaya" },
  { id: "orange", label: "Orange" },
] as const;

const eggOpts: DropdownOption[] = [
  { value: "omelette", label: "Omelette" },
  { value: "fried", label: "Fried" },
  { value: "boiled", label: "Boiled" },
  { value: "scrambled", label: "Scrambled" },
];

function ActionBtn({
  label,
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "neutral" | "action";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        tone === "action"
          ? "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-action px-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
          : "inline-flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-sm font-semibold text-ink hover:bg-neutral-bg disabled:opacity-50"
      }
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function KitchenOrdersPage() {
  const [date, setDate] = useState(todayYmd);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>("breakfast");
  const [day, setDay] = useState<KitchenDayDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [orderModal, setOrderModal] = useState<{
    room: KitchenDayRoomDto;
    editing?: BreakfastOrderDto;
  } | null>(null);
  const [extrasModal, setExtrasModal] = useState<{
    room: KitchenDayRoomDto;
    meal: MealPeriod;
  } | null>(null);
  const [editExtraModal, setEditExtraModal] = useState<{
    room: KitchenDayRoomDto;
    meal: MealPeriod;
    line: RoomExtraSelectionDto;
  } | null>(null);
  const [occRoom, setOccRoom] = useState<KitchenDayRoomDto | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<KitchenDayDto>(`/api/kitchen/day?date=${date}`);
    setDay(data);
  }, [date]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function noteShopping(shopping?: ShoppingSummaryDto) {
    if (!shopping) return;
    if (shopping.buy_line_count === 0) {
      setMsg("Order saved · inventory usage updated · shopping list clear for this date");
    } else {
      setMsg(
        `Order saved · inventory usage updated · shopping list has ${shopping.buy_line_count} line${
          shopping.buy_line_count === 1 ? "" : "s"
        } to buy`,
      );
    }
  }

  async function putExtraLines(
    room: KitchenDayRoomDto,
    meal: MealPeriod,
    lines: Array<{ stock_item_id: string; quantity: number }>,
    successMsg: string,
  ) {
    const extras = extrasForMeal(room, meal);
    try {
      const res = await apiFetch<{ shopping?: ShoppingSummaryDto }>("/api/kitchen/extras", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          meal_period: meal,
          fruits: extras.fruits,
          selected_lines: lines,
        }),
      });
      noteShopping(res.shopping);
      setMsg(successMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      throw e;
    }
  }

  async function removeExtraLine(
    room: KitchenDayRoomDto,
    meal: MealPeriod,
    stockItemId: string,
  ) {
    const extras = extrasForMeal(room, meal);
    const lines = (extras.selected_lines ?? [])
      .filter((l) => l.stock_item_id !== stockItemId)
      .map((l) => ({ stock_item_id: l.stock_item_id, quantity: l.quantity }));
    try {
      await putExtraLines(room, meal, lines, `${mealTitle(meal)} extra removed`);
    } catch {
      /* error already set */
    }
  }

  async function updateExtraLineQty(
    room: KitchenDayRoomDto,
    meal: MealPeriod,
    stockItemId: string,
    quantity: number,
  ) {
    if (!(quantity > 0)) {
      setError("Count must be greater than 0");
      return;
    }
    const extras = extrasForMeal(room, meal);
    const lines = (extras.selected_lines ?? []).map((l) => ({
      stock_item_id: l.stock_item_id,
      quantity: l.stock_item_id === stockItemId ? quantity : l.quantity,
    }));
    await putExtraLines(room, meal, lines, `${mealTitle(meal)} count updated`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Room orders</h1>
          <p className="mt-1 text-caption">
            Breakfast guest meals, plus fruits & extras for breakfast, lunch, and dinner — each meal is saved
            separately. Saving updates stock Used and shopping list.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Link
            to="/kitchen/recipes"
            className="inline-flex h-input min-h-11 items-center justify-center rounded-sm border border-action px-4 text-sm font-semibold text-action"
          >
            Configure recipes
          </Link>
        </div>
      </div>

      <SegmentedControl
        aria-label="Meal period"
        className="w-full sm:w-auto"
        value={mealPeriod}
        onChange={setMealPeriod}
        options={MEAL_TABS}
      />

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? (
        <p className="text-sm font-medium text-credit">
          {msg}{" "}
          <Link to={`/stock/shopping`} className="font-semibold text-action underline">
            Open shopping list
          </Link>
        </p>
      ) : null}

      {(day?.rooms ?? []).map((room) => {
        const extras = extrasForMeal(room, mealPeriod);
        const hasExtras =
          extras.fruits.length > 0 || (extras.selected_lines ?? []).length > 0;
        return (
          <PanelCard
            key={room.id}
            title={`Room ${room.number}`}
            caption={
              mealPeriod === "breakfast"
                ? `Occupants ${room.occupant_count} · Breakfast guests ${room.breakfast_participants}`
                : `Occupants ${room.occupant_count} · ${mealTitle(mealPeriod)} fruits & extras`
            }
          >
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              {mealPeriod === "breakfast" ? (
                <ActionBtn
                  label="Add breakfast"
                  tone="action"
                  disabled={room.orders.filter((o) => o.status !== "cancelled").length >= 3}
                  onClick={() => setOrderModal({ room })}
                >
                  <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </ActionBtn>
              ) : null}
              <ActionBtn label="Occupants" onClick={() => setOccRoom(room)}>
                <Users className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              </ActionBtn>
              <ActionBtn
                label={`${mealTitle(mealPeriod)} fruits & extras`}
                tone={mealPeriod === "breakfast" ? "neutral" : "action"}
                onClick={() => setExtrasModal({ room, meal: mealPeriod })}
              >
                <Apple className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              </ActionBtn>
            </div>

            {mealPeriod === "breakfast" ? (
              room.orders.length === 0 ? (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  <p className="text-caption">
                    No breakfast orders yet. Tap Add breakfast — occupied rooms are not assumed to need
                    breakfast.
                  </p>
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={room.orders.filter((o) => o.status !== "cancelled").length >= 3}
                    onClick={() => setOrderModal({ room })}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add breakfast for room {room.number}
                  </Button>
                </div>
              ) : (
                room.orders.map((o) => {
                  const typeOpts = day?.breakfast_options?.[o.breakfast_type] ?? [];
                  const selectedNames = (o.selected_option_ids ?? [])
                    .map((id) => typeOpts.find((opt) => opt.stock_item_id === id)?.name)
                    .filter(Boolean);
                  return (
                  <ListRow
                    key={o.id}
                    primary={`Guest ${o.guest_number} · ${o.breakfast_type} · ${o.egg_style}`}
                    secondary={[
                      o.serving_time,
                      o.outside_normal_window ? "Outside window" : null,
                      selectedNames.length ? selectedNames.join(", ") : null,
                      o.status,
                      o.special_requests,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    right={
                      <span
                        className="inline-flex min-h-11 min-w-11 items-center justify-center text-action"
                        aria-hidden
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                    }
                    onClick={() => setOrderModal({ room, editing: o })}
                  />
                  );
                })
              )
            ) : !hasExtras ? (
              <div className="border-t border-border px-4 py-3 space-y-2">
                <p className="text-caption">
                  No {mealTitle(mealPeriod).toLowerCase()} fruits or extras yet. Same options as breakfast —
                  saved only for this meal.
                </p>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => setExtrasModal({ room, meal: mealPeriod })}
                >
                  <Apple className="h-4 w-4" aria-hidden />
                  Add {mealTitle(mealPeriod).toLowerCase()} fruits & extras
                </Button>
              </div>
            ) : null}

            {hasExtras ? (
              <div className="border-t border-border">
                <p className="px-4 py-2 text-label">{mealTitle(mealPeriod)} fruits & extras</p>
                {extras.fruits.length > 0 ? (
                  <p className="px-4 pb-2 text-caption">Fruits: {extras.fruits.join(", ")}</p>
                ) : null}
                {(extras.selected_lines ?? []).map((line) => (
                  <ListRow
                    key={line.stock_item_id}
                    primary={line.name ?? "Extra"}
                    secondary={[
                      `${line.quantity} ${line.unit ?? ""}`.trim(),
                      line.show_on_kot ? "on KOT" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    right={
                      <span className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-action hover:bg-neutral-bg"
                          aria-label={`Edit count for ${line.name ?? "extra"}`}
                          onClick={() =>
                            setEditExtraModal({ room, meal: mealPeriod, line })
                          }
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                          aria-label={`Remove ${line.name ?? "extra"}`}
                          onClick={() => void removeExtraLine(room, mealPeriod, line.stock_item_id)}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : null}
          </PanelCard>
        );
      })}

      <Modal
        open={!!orderModal}
        title={orderModal?.editing ? "Edit breakfast order" : "New breakfast order"}
        onClose={() => setOrderModal(null)}
      >
        {orderModal ? (
          <OrderForm
            date={date}
            room={orderModal.room}
            servingTimes={day?.serving_times ?? []}
            breakfastOptions={day?.breakfast_options ?? { maldivian: [], continental: [] }}
            editing={orderModal.editing}
            usedGuests={orderModal.room.orders
              .filter((o) => o.status !== "cancelled" && o.id !== orderModal.editing?.id)
              .map((o) => o.guest_number)}
            onDone={(shopping) => {
              setOrderModal(null);
              noteShopping(shopping);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!extrasModal}
        title={`Room ${extrasModal?.room.number ?? ""} · ${mealTitle(
          extrasModal?.meal ?? "breakfast",
        )} fruits & extras`}
        onClose={() => setExtrasModal(null)}
      >
        {extrasModal ? (
          <ExtrasForm
            date={date}
            room={extrasModal.room}
            mealPeriod={extrasModal.meal}
            options={day?.extra_options ?? []}
            onDone={(shopping) => {
              setExtrasModal(null);
              noteShopping(shopping);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!editExtraModal}
        title={`Edit count · ${editExtraModal?.line.name ?? "Extra"}`}
        onClose={() => setEditExtraModal(null)}
      >
        {editExtraModal ? (
          <EditExtraCountForm
            line={editExtraModal.line}
            onCancel={() => setEditExtraModal(null)}
            onSave={async (quantity) => {
              await updateExtraLineQty(
                editExtraModal.room,
                editExtraModal.meal,
                editExtraModal.line.stock_item_id,
                quantity,
              );
              setEditExtraModal(null);
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!occRoom}
        title={`Room ${occRoom?.number ?? ""} occupants`}
        onClose={() => setOccRoom(null)}
      >
        {occRoom ? (
          <OccupancyForm
            date={date}
            room={occRoom}
            onDone={() => {
              setOccRoom(null);
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function OccupancyForm({
  date,
  room,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  onDone: () => void;
  onError: (s: string) => void;
}) {
  const [count, setCount] = useState(String(room.occupant_count));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/kitchen/occupancy", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          occupant_count: Number(count) || 0,
        }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Single-date occupants for {date}. For from–to stays, use Occupancy.
      </p>
      <TextField
        label="Occupants"
        type="number"
        min={0}
        max={10}
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function initialSelectedOptionIds(
  editing: BreakfastOrderDto | undefined,
  options: BreakfastOptionDto[],
): string[] {
  if (editing?.selected_option_ids?.length) {
    const allowed = new Set(options.map((o) => o.stock_item_id));
    return editing.selected_option_ids.filter((id) => allowed.has(id));
  }
  if (!editing || !options.length) return [];
  // Legacy orders: map boolean flags onto option stock ids.
  const want = new Set<string>();
  if (editing.potato) want.add("potatoes");
  if (editing.juice) want.add("sunquick");
  if (editing.tea) want.add("tea");
  if (editing.coffee) want.add("coffee");
  if (editing.milk) want.add("milk");
  if (editing.sugar) want.add("portion_sugar");
  return options.filter((o) => o.code && want.has(o.code)).map((o) => o.stock_item_id);
}

function OrderForm({
  date,
  room,
  servingTimes,
  breakfastOptions,
  editing,
  usedGuests,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  servingTimes: string[];
  breakfastOptions: Record<BreakfastType, BreakfastOptionDto[]>;
  editing?: BreakfastOrderDto;
  usedGuests: number[];
  onDone: (shopping?: ShoppingSummaryDto) => void;
  onError: (s: string) => void;
}) {
  const availableGuests = [1, 2, 3].filter((g) => !usedGuests.includes(g) || g === editing?.guest_number);
  const [guestNumber, setGuestNumber] = useState(String(editing?.guest_number ?? availableGuests[0] ?? 1));
  const [servingTime, setServingTime] = useState(editing?.serving_time ?? "07:30");
  const [customTime, setCustomTime] = useState(
    editing?.outside_normal_window ? editing.serving_time : "",
  );
  const [useCustomTime, setUseCustomTime] = useState(!!editing?.outside_normal_window);
  const [breakfastType, setBreakfastType] = useState<BreakfastType>(editing?.breakfast_type ?? "maldivian");
  const [eggStyle, setEggStyle] = useState<EggStyle>(
    editing?.egg_style ?? (editing?.breakfast_type === "continental" ? "fried" : "omelette"),
  );
  const typeOptions = breakfastOptions[breakfastType] ?? [];
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() =>
    initialSelectedOptionIds(editing, breakfastOptions[editing?.breakfast_type ?? "maldivian"] ?? []),
  );
  const [special, setSpecial] = useState(editing?.special_requests ?? "");
  const [status, setStatus] = useState(editing?.status ?? "pending");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEggStyle(breakfastType === "continental" ? "fried" : "omelette");
    }
    const nextOpts = breakfastOptions[breakfastType] ?? [];
    if (editing && editing.breakfast_type === breakfastType) {
      setSelectedOptionIds(initialSelectedOptionIds(editing, nextOpts));
    } else {
      setSelectedOptionIds((prev) => prev.filter((id) => nextOpts.some((o) => o.stock_item_id === id)));
    }
  }, [breakfastType, breakfastOptions, editing]);

  function toggleOption(stockItemId: string) {
    setSelectedOptionIds((prev) =>
      prev.includes(stockItemId) ? prev.filter((id) => id !== stockItemId) : [...prev, stockItemId],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const time = useCustomTime ? customTime : servingTime;
      const payload = {
        breakfast_date: date,
        room_id: room.id,
        guest_number: Number(guestNumber),
        serving_time: time,
        breakfast_type: breakfastType,
        egg_style: eggStyle,
        selected_option_ids: selectedOptionIds,
        special_requests: special.trim() || null,
        status,
      };
      if (editing) {
        const res = await apiFetch<BreakfastOrderDto & { shopping?: ShoppingSummaryDto }>(
          `/api/kitchen/orders/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        onDone(res.shopping);
      } else {
        const res = await apiFetch<BreakfastOrderDto & { shopping?: ShoppingSummaryDto }>(
          "/api/kitchen/orders",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        onDone(res.shopping);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/kitchen/orders/${editing.id}`, { method: "DELETE" });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const timeOpts: DropdownOption[] = servingTimes.map((t) => ({ value: t, label: t }));

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">Room {room.number}</p>
      <Dropdown
        label="Guest number"
        value={guestNumber}
        onChange={setGuestNumber}
        options={availableGuests.map((g) => ({ value: String(g), label: String(g) }))}
      />
      <Dropdown
        label="Breakfast type"
        value={breakfastType}
        onChange={(v) => setBreakfastType(v as BreakfastType)}
        options={[
          { value: "maldivian", label: "Maldivian" },
          { value: "continental", label: "Continental" },
        ]}
      />

      <div className="rounded-[var(--radius)] border border-border bg-neutral-bg px-4 py-3 text-sm text-ink">
        <p className="font-semibold">
          {breakfastType === "maldivian" ? "Maldivian" : "Continental"} menu
        </p>
        <p className="text-caption">
          Base ingredients and optional sides come from Kitchen → Recipes for this breakfast type.
        </p>
        <Link
          to="/kitchen/recipes"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-action underline"
        >
          Edit breakfast recipes & sides
        </Link>
      </div>

      <Dropdown label="Egg style" value={eggStyle} onChange={(v) => setEggStyle(v as EggStyle)} options={eggOpts} />

      <fieldset className="space-y-1">
        <legend className="text-label">Options & sides</legend>
        {typeOptions.length ? (
          <>
            <p className="text-caption">
              From Recipes for this breakfast type. Selected items count for KOT and kitchen stock.
            </p>
            {typeOptions.map((opt) => (
              <label
                key={opt.stock_item_id}
                className="flex min-h-11 items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={selectedOptionIds.includes(opt.stock_item_id)}
                  onChange={() => toggleOption(opt.stock_item_id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{opt.name}</span>
                  <span className="block text-caption">
                    {opt.qty_per_serving} {opt.unit}
                    {opt.show_on_kot ? " · on KOT" : ""}
                    {opt.notes ? ` · ${opt.notes}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </>
        ) : (
          <p className="text-caption">
            No optional sides configured. Add lines marked “Optional side” under{" "}
            <Link to="/kitchen/recipes" className="font-semibold text-action underline">
              Recipes → {breakfastType === "maldivian" ? "Maldivian" : "Continental"}
            </Link>
            .
          </p>
        )}
      </fieldset>

      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={useCustomTime} onChange={(e) => setUseCustomTime(e.target.checked)} />
        Special time outside 7:00–9:30 (departing guests)
      </label>
      {useCustomTime ? (
        <TextField
          label="Serving time (HH:mm)"
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          placeholder="06:30"
          required
        />
      ) : (
        <Dropdown label="Serving time" value={servingTime} onChange={setServingTime} options={timeOpts} />
      )}

      <TextField label="Special requests" value={special} onChange={(e) => setSpecial(e.target.value)} />
      <Dropdown
        label="Status"
        value={status}
        onChange={(v) => setStatus(v as typeof status)}
        options={[
          { value: "pending", label: "Pending" },
          { value: "served", label: "Served" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {editing ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void remove()}>
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function EditExtraCountForm({
  line,
  onSave,
  onCancel,
  onError,
}: {
  line: RoomExtraSelectionDto;
  onSave: (quantity: number) => Promise<void>;
  onCancel: () => void;
  onError: (s: string) => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [saving, setSaving] = useState(false);
  const unit = line.unit?.trim() || "";

  function bump(delta: number) {
    const n = Number(qty);
    const base = Number.isFinite(n) && n > 0 ? n : 0;
    const next = Math.max(0.01, Math.round((base + delta) * 100) / 100);
    setQty(String(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    if (!(quantity > 0)) {
      onError("Count must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      await onSave(quantity);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Change how many {line.name ?? "of this extra"} to prepare for this meal
        {unit ? ` (${unit})` : ""}.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface text-lg font-semibold text-ink hover:bg-neutral-bg"
          aria-label="Decrease count"
          onClick={() => bump(-1)}
        >
          −
        </button>
        <div className="min-w-0 flex-1">
          <TextField
            label={`Count${unit ? ` (${unit})` : ""}`}
            type="number"
            inputMode="decimal"
            step="any"
            min={0.01}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="font-num"
          />
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface text-lg font-semibold text-ink hover:bg-neutral-bg"
          aria-label="Increase count"
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? "Saving…" : "Save count"}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function defaultQty(opt: RoomExtraOptionDto) {
  const n = Number(opt.qty_per_serving);
  return n > 0 ? n : 1;
}

function initialSelectedLines(
  extras: RoomDayExtrasDto,
  options: RoomExtraOptionDto[],
): RoomExtraSelectionDto[] {
  if ((extras.selected_lines ?? []).length) {
    return extras.selected_lines.map((l) => {
      const opt = options.find((o) => o.stock_item_id === l.stock_item_id);
      return {
        ...l,
        name: l.name ?? opt?.name,
        unit: l.unit ?? opt?.unit,
        code: l.code ?? opt?.code ?? null,
        show_on_kot: l.show_on_kot ?? opt?.show_on_kot,
        quantity: l.quantity > 0 ? l.quantity : opt ? defaultQty(opt) : 1,
      };
    });
  }
  const byCode = new Map(options.filter((o) => o.code).map((o) => [o.code!, o]));
  const lines: RoomExtraSelectionDto[] = [];
  const push = (code: string) => {
    const opt = byCode.get(code);
    if (!opt) return;
    lines.push({
      stock_item_id: opt.stock_item_id,
      quantity: defaultQty(opt),
      name: opt.name,
      unit: opt.unit,
      code: opt.code,
      show_on_kot: opt.show_on_kot,
    });
  };
  if (extras.honey) push("honey");
  if (extras.nutella) push("nutella");
  if (extras.cereal) push("cornflakes");
  if (extras.water_bottle) push("water_bottle");
  if (extras.pancake) {
    for (const code of ["pancake_batch", "pancake", "pancakes"]) {
      if (byCode.has(code)) {
        push(code);
        break;
      }
    }
  }
  return lines;
}

function ExtrasForm({
  date,
  room,
  mealPeriod,
  options,
  onDone,
  onError,
}: {
  date: string;
  room: KitchenDayRoomDto;
  mealPeriod: MealPeriod;
  options: RoomExtraOptionDto[];
  onDone: (shopping?: ShoppingSummaryDto) => void;
  onError: (s: string) => void;
}) {
  const extras = extrasForMeal(room, mealPeriod);
  const [fruits, setFruits] = useState<string[]>(extras.fruits);
  const [lines, setLines] = useState<RoomExtraSelectionDto[]>(() =>
    initialSelectedLines(extras, options),
  );
  const [saving, setSaving] = useState(false);
  const available = options.filter((o) => !lines.some((l) => l.stock_item_id === o.stock_item_id));

  function toggleFruit(id: string) {
    setFruits((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  /** Add recipe default qty (Qty when selected); further Adds increment by that amount. */
  function addWithDefault(opt: RoomExtraOptionDto) {
    const qty = defaultQty(opt);
    setLines((prev) => {
      if (prev.some((l) => l.stock_item_id === opt.stock_item_id)) {
        return prev.map((l) =>
          l.stock_item_id === opt.stock_item_id ? { ...l, quantity: l.quantity + qty } : l,
        );
      }
      return [
        ...prev,
        {
          stock_item_id: opt.stock_item_id,
          quantity: qty,
          name: opt.name,
          unit: opt.unit,
          code: opt.code,
          show_on_kot: opt.show_on_kot,
        },
      ];
    });
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.stock_item_id !== id));
  }

  function updateQty(id: string, qtyStr: string) {
    setLines((prev) =>
      prev.map((l) => (l.stock_item_id === id ? { ...l, quantity: Number(qtyStr) || 0 } : l)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (fruits.length > 0 && (fruits.length < 2 || fruits.length > 3)) {
      onError("Select 2–3 fruit types, or none");
      return;
    }
    if (lines.some((l) => !(l.quantity > 0))) {
      onError("Each extra needs a quantity greater than 0");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ shopping?: ShoppingSummaryDto }>("/api/kitchen/extras", {
        method: "PUT",
        body: JSON.stringify({
          date,
          room_id: room.id,
          meal_period: mealPeriod,
          fruits,
          selected_lines: lines.map((l) => ({
            stock_item_id: l.stock_item_id,
            quantity: l.quantity,
          })),
        }),
      });
      onDone(res.shopping);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        {mealTitle(mealPeriod)} only — fruits and extras for this meal do not copy to other meals. Every room
        may take 2–3 fruit types.
      </p>
      <div className="grid grid-cols-2 gap-1">
        {fruitOpts.map((f) => (
          <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={fruits.includes(f.id)} onChange={() => toggleFruit(f.id)} />
            {f.label}
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-label">Added extras</p>
        <p className="text-caption">
          Qty starts from Recipes → Qty when selected. Tap Add again to add that amount, or edit Count,
          then Save.
        </p>
        {lines.length ? (
          lines.map((line) => (
            <div
              key={line.stock_item_id}
              className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{line.name ?? "Extra"}</p>
                <p className="text-caption">
                  {line.unit ?? ""}
                  {line.show_on_kot ? " · on KOT" : " · stock only"}
                </p>
              </div>
              <div className="w-28">
                <TextField
                  label="Count"
                  type="number"
                  step="any"
                  min={0}
                  value={String(line.quantity)}
                  onChange={(e) => updateQty(line.stock_item_id, e.target.value)}
                />
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                aria-label={`Remove ${line.name ?? "extra"}`}
                onClick={() => removeLine(line.stock_item_id)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
            </div>
          ))
        ) : (
          <p className="text-caption">No extras added yet. Tap Add on an item below.</p>
        )}
      </div>

      {options.length ? (
        <div className="space-y-2">
          <p className="text-label">Add from recipe</p>
          {available.length ? (
            available.map((opt) => (
              <div
                key={opt.stock_item_id}
                className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{opt.name}</p>
                  <p className="text-caption">
                    Default {defaultQty(opt)} {opt.unit}
                    {opt.show_on_kot ? " · on KOT" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => addWithDefault(opt)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add {defaultQty(opt)}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-caption">All configured extras are already on the list.</p>
          )}
          <p className="text-caption">
            Defaults come from{" "}
            <Link to="/kitchen/recipes" className="font-semibold text-action underline">
              Recipes → Room extras · Qty when selected
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-caption">
          No extras configured.{" "}
          <Link to="/kitchen/recipes" className="font-semibold text-action underline">
            Add items under Recipes → Room extras
          </Link>
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : `Save ${mealTitle(mealPeriod).toLowerCase()} extras`}
      </Button>
    </form>
  );
}
