'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import TodayCard from './cards/TodayCard'
import OpportunitiesCard from './cards/OpportunitiesCard'
import AttentionCard from './cards/AttentionCard'
import ConversationsCard from './cards/ConversationsCard'
import DiscoveriesCard from './cards/DiscoveriesCard'
import CandidatesCard from './cards/CandidatesCard'
import { CARD_REGISTRY } from '@/lib/dashboard/cards'
import { IconX } from '@/components/ui/icons'
import type {
  DashboardCardId, DashboardLayout, Lead, Company, Opportunity,
  Discovery, FirmCandidateRow, SnoozedSignal, Thread,
} from '@/lib/types'

export interface DashboardData {
  leads: Lead[]
  companies: Company[]
  opportunities: Opportunity[]
  threads: Thread[]
  strongDiscoveries: Discovery[]
  highCandidates: FirmCandidateRow[]
  snoozedSignals: SnoozedSignal[]
}

interface Props {
  initialLayout: DashboardLayout
  data: DashboardData
}

export default function DashboardClient({ initialLayout, data }: Props) {
  const [layout, setLayout] = useState(initialLayout)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // 8px activation distance prevents accidental drags when just clicking
  // buttons inside cards.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Outside-click close for picker
  useEffect(() => {
    if (!picking) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicking(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [picking])

  const persist = useCallback(async (next: DashboardLayout) => {
    setLayout(next)
    try {
      await fetch('/api/dashboard/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } catch (err) {
      console.warn('[dashboard] persist error:', err)
    }
  }, [])

  const hideCard = useCallback((id: DashboardCardId) => {
    if (id === 'today') return  // Today is permanent
    persist({
      cards: layout.cards.map((c) => c.id === id ? { ...c, visible: false } : c),
    })
  }, [layout, persist])

  const showCard = useCallback((id: DashboardCardId) => {
    persist({
      cards: layout.cards.map((c) => c.id === id ? { ...c, visible: true } : c),
    })
    setPicking(false)
  }, [layout, persist])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Reorder among visible non-today cards. Today + hidden cards keep
    // their positions in the saved layout.
    const visibleNonToday = layout.cards.filter((c) => c.visible && c.id !== 'today')
    const oldIndex = visibleNonToday.findIndex((c) => c.id === active.id)
    const newIndex = visibleNonToday.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(visibleNonToday, oldIndex, newIndex)
    const todayEntry = layout.cards.find((c) => c.id === 'today')
    const hiddenEntries = layout.cards.filter((c) => !c.visible)

    const nextCards: typeof layout.cards = []
    if (todayEntry) nextCards.push(todayEntry)
    nextCards.push(...reordered)
    nextCards.push(...hiddenEntries)

    persist({ cards: nextCards })
  }, [layout, persist])

  const hiddenCards = layout.cards.filter((c) => !c.visible && CARD_REGISTRY[c.id]?.removable)
  const visibleNonTodayIds = layout.cards
    .filter((c) => c.visible && c.id !== 'today')
    .map((c) => c.id)
  const todayEntry = layout.cards.find((c) => c.id === 'today' && c.visible)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1120 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: 4,
          }}>
            {todayLabel()}
          </div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => { setEditing((v) => !v); setPicking(false) }}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
            background: editing ? 'var(--accent)' : 'transparent',
            border: editing ? '1px solid var(--accent)' : '1px solid var(--border)',
            color: editing ? '#000' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: editing ? 600 : 400,
          }}
        >
          {editing ? 'Done editing' : 'Edit dashboard'}
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {todayEntry && (
          <CardSlot id="today" editing={editing} onHide={() => hideCard('today')} sortable={false}>
            {renderCard('today', data)}
          </CardSlot>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleNonTodayIds} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {visibleNonTodayIds.map((id) => (
                <CardSlot
                  key={id}
                  id={id}
                  editing={editing}
                  onHide={() => hideCard(id)}
                  sortable
                >
                  {renderCard(id, data)}
                </CardSlot>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Add card picker (only in edit mode) */}
      {editing && (
        <div ref={pickerRef} style={{ position: 'relative', marginTop: 28 }}>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            disabled={hiddenCards.length === 0}
            style={{
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'transparent',
              border: '1px dashed var(--border)',
              color: hiddenCards.length === 0 ? 'var(--text-faint)' : 'var(--text-muted)',
              cursor: hiddenCards.length === 0 ? 'default' : 'pointer',
              width: '100%',
              textAlign: 'left',
              opacity: hiddenCards.length === 0 ? 0.6 : 1,
            }}
          >
            {hiddenCards.length === 0 ? 'All cards added' : '+ Add card'}
          </button>

          {picking && hiddenCards.length > 0 && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 30,
              padding: 4,
            }}>
              {hiddenCards.map((entry) => {
                const meta = CARD_REGISTRY[entry.id]
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => showCard(entry.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--r-xs)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{meta.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{meta.description}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
}

function CardSlot({
  id, editing, onHide, sortable, children,
}: {
  id: DashboardCardId
  editing: boolean
  onHide: () => void
  sortable: boolean
  children: React.ReactNode
}) {
  // Hooks must be called unconditionally. When `sortable` is false (Today
  // card), we still call useSortable but ignore its transform/listeners.
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled: !sortable || !editing })

  const meta = CARD_REGISTRY[id]
  const showRemove = editing && meta?.removable
  const showDragHandle = editing && sortable

  const style: React.CSSProperties = sortable && editing
    ? {
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : 1,
      }
    : { position: 'relative' }

  return (
    <div ref={sortable ? setNodeRef : undefined} style={style}>
      {showDragHandle && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${meta.title} card`}
          title="Drag to reorder"
          style={{
            position: 'absolute',
            top: -6,
            left: -6,
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            color: 'var(--text-muted)',
            cursor: 'grab',
            zIndex: 5,
            boxShadow: 'var(--shadow-sm)',
            fontSize: 11,
            lineHeight: 1,
            touchAction: 'none',
          }}
        >
          ⋮⋮
        </button>
      )}
      {showRemove && (
        <button
          type="button"
          onClick={onHide}
          aria-label={`Remove ${meta.title} card`}
          title={`Remove ${meta.title}`}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            color: 'var(--red)',
            cursor: 'pointer',
            zIndex: 5,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <IconX size={11} />
        </button>
      )}
      {children}
    </div>
  )
}

function renderCard(id: DashboardCardId, data: DashboardData): React.ReactNode {
  switch (id) {
    case 'today':
      return (
        <TodayCard
          leads={data.leads}
          opportunities={data.opportunities}
          threads={data.threads}
          initialSnoozedSignals={data.snoozedSignals}
        />
      )
    case 'opportunities':
      return <OpportunitiesCard opportunities={data.opportunities} leads={data.leads} />
    case 'attention':
      return <AttentionCard leads={data.leads} />
    case 'conversations':
      return <ConversationsCard threads={data.threads} leads={data.leads} />
    case 'discoveries':
      return <DiscoveriesCard discoveries={data.strongDiscoveries} />
    case 'candidates':
      return <CandidatesCard candidates={data.highCandidates} />
  }
}
