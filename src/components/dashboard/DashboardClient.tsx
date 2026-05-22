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
import { Icon } from '@/components/ui/icons'
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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
    if (id === 'today') return
    persist({ cards: layout.cards.map((c) => c.id === id ? { ...c, visible: false } : c) })
  }, [layout, persist])

  const showCard = useCallback((id: DashboardCardId) => {
    persist({ cards: layout.cards.map((c) => c.id === id ? { ...c, visible: true } : c) })
    setPicking(false)
  }, [layout, persist])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

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
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{todayLabel()}</div>
          <div className="page-title">Dashboard</div>
        </div>
        <div className="page-actions">
          <button
            className={`btn ${editing ? 'btn-primary' : ''}`}
            onClick={() => { setEditing((v) => !v); setPicking(false) }}
          >
            {editing ? 'Done editing' : 'Edit dashboard'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {todayEntry && (
          <CardSlot id="today" editing={editing} onHide={() => hideCard('today')} sortable={false}>
            {renderCard('today', data)}
          </CardSlot>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleNonTodayIds} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {visibleNonTodayIds.map((id) => (
                <CardSlot key={id} id={id} editing={editing} onHide={() => hideCard(id)} sortable>
                  {renderCard(id, data)}
                </CardSlot>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {editing && (
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              className="add-card"
              onClick={() => setPicking((v) => !v)}
              disabled={hiddenCards.length === 0}
              style={{
                opacity: hiddenCards.length === 0 ? 0.5 : 1,
                cursor: hiddenCards.length === 0 ? 'default' : 'pointer',
              }}
            >
              <span className="row" style={{ gap: 8 }}>
                <Icon name="plus" size={13} />
                {hiddenCards.length === 0 ? 'All cards added' : 'Add card'}
              </span>
            </button>
            {picking && hiddenCards.length > 0 && (
              <div className="menu" style={{ left: 0, right: 0 }}>
                {hiddenCards.map((entry) => {
                  const meta = CARD_REGISTRY[entry.id]
                  return (
                    <button
                      key={entry.id}
                      className="menu-item"
                      onClick={() => showCard(entry.id)}
                      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px' }}
                    >
                      <span className="ink" style={{ fontSize: 12.5, fontWeight: 500 }}>{meta.title}</span>
                      <span className="ink-3" style={{ fontSize: 11 }}>{meta.description}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
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
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${meta.title} card`}
          title="Drag to reorder"
          style={{ touchAction: 'none' }}
        >
          <Icon name="drag" size={12} />
        </button>
      )}
      {showRemove && (
        <button
          type="button"
          className="x-handle"
          onClick={onHide}
          aria-label={`Remove ${meta.title} card`}
          title={`Remove ${meta.title}`}
        >
          <Icon name="x" size={11} />
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
