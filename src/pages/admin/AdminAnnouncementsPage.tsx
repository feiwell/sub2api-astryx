// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Admin Announcements Management - Searchable table template
 *
 * Manages system announcements with status filtering, search, and CRUD operations.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useI18n} from '~/i18n';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {
  Table,
  pixel,
  proportional,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import type {
  TableColumn,
  TableSortComparator,
} from '@astryxdesign/core/Table';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Grid} from '@astryxdesign/core/Grid';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Spinner} from '@astryxdesign/core/Spinner';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {DateTimeInput, type ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Selector} from '@astryxdesign/core/Selector';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  ArrowPathIcon,
  ChartBarIcon,
  ClockIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

import {toast} from '~/lib/toast';
import {
  formatDateTime as formatFullDateTime,
  formatDateTimeLocalInput,
  formatDateTimeToMinute,
  formatRelativeWithDateTime,
  parseDateTimeLocalInput,
} from '@/utils/format';
import {getPersistedPageSize, setPersistedPageSize} from '@/composables/usePersistedPageSize';
import {getConfiguredTablePageSizeOptions} from '@/utils/tablePreferences';
import {adminAPI} from '~/lib/api/admin';
import type {
  AdminGroup,
  Announcement,
  AnnouncementCondition,
  AnnouncementConditionGroup,
  AnnouncementOperator,
  AnnouncementTargeting,
  AnnouncementUserReadStatus,
} from '@/types';

// ============= DATA TYPES =============

type AnnouncementStatus = 'draft' | 'active' | 'archived';
type AnnouncementNotifyMode = 'silent' | 'popup';
type AnnouncementRow = Announcement & Record<string, unknown>;

interface AnnouncementForm {
  title: string;
  content: string;
  status: AnnouncementStatus;
  notify_mode: AnnouncementNotifyMode;
  starts_at_str: string;
  ends_at_str: string;
  targeting: AnnouncementTargeting;
}

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  content: '',
  status: 'draft',
  notify_mode: 'silent',
  starts_at_str: '',
  ends_at_str: '',
  targeting: {any_of: []},
};

const MAX_TARGETING_ITEMS = 50;

// ============= FORMATTING =============

// Follows the active UI locale (utils/format reads it from the i18n shim).
function formatDateTime(iso: string): string {
  return formatDateTimeToMinute(iso);
}

// RFC3339 from the backend -> datetime-local "YYYY-MM-DDTHH:MM"
function isoToLocalInput(iso: string | undefined | null): string {
  return iso ? formatDateTimeLocalInput(Math.floor(new Date(iso).getTime() / 1000)) : '';
}

function isoToUnix(iso: string | undefined | null): number | null {
  return iso ? Math.floor(new Date(iso).getTime() / 1000) : null;
}

// ============= COLUMNS =============

function getColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  onPreview: (ann: Announcement) => void,
  onReadStatus: (ann: Announcement) => void,
  onEdit: (ann: Announcement) => void,
  onDelete: (ann: Announcement) => void,
): TableColumn<AnnouncementRow>[] {
  const targetingSummary = (targeting: AnnouncementTargeting) => {
    const anyOf = targeting?.any_of ?? [];
    if (anyOf.length === 0) return t('admin.announcements.targetingSummaryAll');
    return t('admin.announcements.targetingSummaryCustom', {groups: anyOf.length});
  };
  return [
    {
      key: 'title',
      header: t('admin.announcements.columns.title'),
      width: proportional(3),
      sortable: true,
      renderCell: item => (
        <VStack gap={1}>
          <Text weight="medium">{item.title}</Text>
          <Text color="secondary">
            #{item.id} · {formatDateTime(item.created_at)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'status',
      header: t('admin.announcements.columns.status'),
      width: pixel(110),
      sortable: true,
      renderCell: item => {
        const variant =
          item.status === 'active' ? 'success' :
          item.status === 'draft' ? 'neutral' :
          'warning';
        return (
          <Badge variant={variant} label={t(`admin.announcements.statusLabels.${item.status}`)} />
        );
      },
    },
    {
      key: 'notify_mode',
      header: t('admin.announcements.columns.notifyMode'),
      width: pixel(110),
      renderCell: item => (
        <Badge
          variant={item.notify_mode === 'popup' ? 'warning' : 'neutral'}
          label={t(`admin.announcements.notifyModeLabels.${item.notify_mode || 'silent'}`)}
        />
      ),
    },
    {
      key: 'targeting',
      header: t('admin.announcements.columns.targeting'),
      width: proportional(1.2),
      renderCell: item => <Text color="secondary">{targetingSummary(item.targeting)}</Text>,
    },
    {
      key: 'timeRange',
      header: t('admin.announcements.columns.timeRange'),
      width: proportional(1.8),
      renderCell: item => (
        <VStack gap={0.5}>
          <Text type="supporting">
            {t('admin.announcements.form.startsAt')}:{' '}
            {item.starts_at ? formatDateTime(item.starts_at) : t('admin.announcements.timeImmediate')}
          </Text>
          <Text type="supporting">
            {t('admin.announcements.form.endsAt')}:{' '}
            {item.ends_at ? formatDateTime(item.ends_at) : t('admin.announcements.timeNever')}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'actions',
      header: t('admin.announcements.columns.actions'),
      width: pixel(184),
      align: 'end',
      renderCell: item => (
        <HStack gap={1} hAlign="end">
          <IconButton
            label={t('admin.announcements.preview')}
            tooltip={t('admin.announcements.preview')}
            variant="ghost"
            icon={<Icon icon={EyeIcon} />}
            onClick={() => onPreview(item)}
          />
          <IconButton
            label={t('admin.announcements.readStatus')}
            tooltip={t('admin.announcements.readStatus')}
            variant="ghost"
            icon={<Icon icon={ChartBarIcon} />}
            onClick={() => onReadStatus(item)}
          />
          <IconButton
            label={t('common.edit')}
            tooltip={t('common.edit')}
            variant="ghost"
            icon={<Icon icon={PencilIcon} />}
            onClick={() => onEdit(item)}
          />
          <IconButton
            label={t('common.delete')}
            tooltip={t('common.delete')}
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            onClick={() => onDelete(item)}
          />
        </HStack>
      ),
    },
  ];
}

const COMPARATORS: Partial<Record<string, TableSortComparator<AnnouncementRow>>> = {
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => a.status.localeCompare(b.status),
  created_at: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
};

// ============= STATUS FILTERS =============

const STATUS_FILTERS: {value: AnnouncementStatus | 'all'; labelKey: string}[] = [
  {value: 'all', labelKey: 'admin.announcements.allStatus'},
  {value: 'draft', labelKey: 'admin.announcements.statusLabels.draft'},
  {value: 'active', labelKey: 'admin.announcements.statusLabels.active'},
  {value: 'archived', labelKey: 'admin.announcements.statusLabels.archived'},
];

// ============= TARGETING EDITOR (port of AnnouncementTargetingEditor.vue) =============

const defaultSubscriptionCondition = (): AnnouncementCondition => ({type: 'subscription', operator: 'in', group_ids: []});
const defaultBalanceCondition = (): AnnouncementCondition => ({type: 'balance', operator: 'gte', value: 0});

function targetingValidationError(
  targeting: AnnouncementTargeting,
  t: (key: string) => string,
): string {
  const groups = targeting?.any_of ?? [];
  if (groups.length === 0) return '';
  if (groups.length > MAX_TARGETING_ITEMS) return 'any_of > 50';
  for (const g of groups) {
    const allOf = g?.all_of ?? [];
    if (allOf.length === 0) return t('admin.announcements.form.addAndCondition');
    if (allOf.length > MAX_TARGETING_ITEMS) return 'all_of > 50';
    for (const c of allOf) {
      if (c.type === 'subscription' && (!c.group_ids || c.group_ids.length === 0)) {
        return t('admin.announcements.form.selectPackages');
      }
    }
  }
  return '';
}

function AnnouncementTargetingEditor({
  value,
  onChange,
  groups,
}: {
  value: AnnouncementTargeting;
  onChange: (next: AnnouncementTargeting) => void;
  groups: AdminGroup[];
}) {
  const {t} = useI18n();
  const anyOf = value?.any_of ?? [];
  // "Custom" stays selected while the admin edits, even with every group removed
  const [customMode, setCustomMode] = useState(anyOf.length > 0);
  const mode = customMode || anyOf.length > 0 ? 'custom' : 'all';

  const groupOptions = useMemo(
    () => groups.map(g => ({value: String(g.id), label: g.name})),
    [groups],
  );
  const conditionTypeOptions = [
    {value: 'subscription', label: t('admin.announcements.form.conditionSubscription')},
    {value: 'balance', label: t('admin.announcements.form.conditionBalance')},
  ];
  const balanceOperatorOptions = (['gt', 'gte', 'lt', 'lte', 'eq'] as const).map(op => ({
    value: op,
    label: t(`admin.announcements.operators.${op}`),
  }));

  const update = (mutator: (draft: AnnouncementConditionGroup[]) => void) => {
    const draft: AnnouncementConditionGroup[] = JSON.parse(JSON.stringify(anyOf));
    mutator(draft);
    onChange({any_of: draft});
  };

  const setMode = (next: string) => {
    if (next === 'all') {
      setCustomMode(false);
      onChange({any_of: []});
      return;
    }
    setCustomMode(true);
    if (anyOf.length === 0) onChange({any_of: [{all_of: [defaultSubscriptionCondition()]}]});
  };

  const validationError = mode === 'custom'
    ? anyOf.length === 0
      ? t('admin.announcements.form.addOrGroup')
      : targetingValidationError(value, t)
    : '';

  return (
    <Card variant="muted" padding={4}>
      <VStack gap={4} hAlign="stretch">
        <RadioList
          label={t('admin.announcements.form.targetingMode')}
          description={mode === 'all' ? t('admin.announcements.form.targetingAll') : t('admin.announcements.form.targetingCustom')}
          value={mode}
          onChange={setMode}
          orientation="horizontal"
        >
          <RadioListItem value="all" label={t('admin.announcements.form.targetingAll')} />
          <RadioListItem value="custom" label={t('admin.announcements.form.targetingCustom')} />
        </RadioList>

        {mode === 'custom' && (
          <VStack gap={4} hAlign="stretch">
            <HStack gap={2} vAlign="center" hAlign="between">
              <Text weight="medium">
                OR{' '}
                <Text type="supporting">
                  ({anyOf.length}/{MAX_TARGETING_ITEMS})
                </Text>
              </Text>
              <Button
                label={t('admin.announcements.form.addOrGroup')}
                icon={<Icon icon={PlusIcon} />}
                isDisabled={anyOf.length >= MAX_TARGETING_ITEMS}
                onClick={() =>
                  update(draft => {
                    draft.push({all_of: [defaultSubscriptionCondition()]});
                  })
                }
              />
            </HStack>

            {anyOf.length === 0 && (
              <Text type="supporting">
                {t('admin.announcements.form.targetingCustom')}: {t('admin.announcements.form.addOrGroup')}
              </Text>
            )}

            {anyOf.map((group, groupIndex) => {
              const allOf = group.all_of ?? [];
              return (
                <Card key={groupIndex} padding={4}>
                  <VStack gap={3} hAlign="stretch">
                    <HStack gap={3} vAlign="start" hAlign="between">
                      <VStack gap={0.5}>
                        <Text weight="medium">
                          {t('admin.announcements.form.targetingCustom')} #{groupIndex + 1}{' '}
                          <Text type="supporting">
                            AND ({allOf.length}/{MAX_TARGETING_ITEMS})
                          </Text>
                        </Text>
                        <Text type="supporting">{t('admin.announcements.form.addAndCondition')}</Text>
                      </VStack>
                      <Button
                        label={t('common.delete')}
                        icon={<Icon icon={TrashIcon} />}
                        onClick={() =>
                          update(draft => {
                            draft.splice(groupIndex, 1);
                          })
                        }
                      />
                    </HStack>

                    {allOf.map((cond, condIndex) => (
                      <Card key={condIndex} variant="muted" padding={3}>
                        <HStack gap={3} vAlign="end" wrap="wrap">
                          <Selector
                            label={t('admin.announcements.form.conditionType')}
                            value={cond.type}
                            options={conditionTypeOptions}
                            width={200}
                            onChange={next =>
                              update(draft => {
                                const target = draft[groupIndex].all_of;
                                if (!target) return;
                                target[condIndex] =
                                  next === 'subscription' ? defaultSubscriptionCondition() : defaultBalanceCondition();
                              })
                            }
                          />
                          {cond.type === 'subscription' ? (
                            <StackItem size="fill">
                              <MultiSelector
                                label={t('admin.announcements.form.selectPackages')}
                                options={groupOptions}
                                value={(cond.group_ids ?? []).map(String)}
                                hasSearch
                                triggerDisplay="badges"
                                onChange={ids =>
                                  update(draft => {
                                    const target = draft[groupIndex].all_of?.[condIndex];
                                    if (!target) return;
                                    target.operator = 'in';
                                    target.group_ids = ids.map(Number);
                                  })
                                }
                              />
                            </StackItem>
                          ) : (
                            <>
                              <Selector
                                label={t('admin.announcements.form.operator')}
                                value={cond.operator}
                                options={balanceOperatorOptions}
                                width={176}
                                onChange={op =>
                                  update(draft => {
                                    const target = draft[groupIndex].all_of?.[condIndex];
                                    if (target) target.operator = op as AnnouncementOperator;
                                  })
                                }
                              />
                              <StackItem size="fill">
                                <NumberInput
                                  label={t('admin.announcements.form.balanceValue')}
                                  value={cond.value ?? 0}
                                  step={null}
                                  onChange={n =>
                                    update(draft => {
                                      const target = draft[groupIndex].all_of?.[condIndex];
                                      if (target) target.value = Number.isFinite(n) ? n : 0;
                                    })
                                  }
                                />
                              </StackItem>
                            </>
                          )}
                          <Button
                            label={t('common.delete')}
                            icon={<Icon icon={TrashIcon} />}
                            onClick={() =>
                              update(draft => {
                                draft[groupIndex].all_of?.splice(condIndex, 1);
                              })
                            }
                          />
                        </HStack>
                      </Card>
                    ))}

                    <HStack hAlign="end">
                      <Button
                        label={t('admin.announcements.form.addAndCondition')}
                        icon={<Icon icon={PlusIcon} />}
                        isDisabled={allOf.length >= MAX_TARGETING_ITEMS}
                        onClick={() =>
                          update(draft => {
                            const target = draft[groupIndex];
                            if (!target.all_of) target.all_of = [];
                            target.all_of.push(defaultSubscriptionCondition());
                          })
                        }
                      />
                    </HStack>
                  </VStack>
                </Card>
              );
            })}

            {validationError && <Banner status="error" title={validationError} />}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// ============= READ STATUS DIALOG (port of AnnouncementReadStatusDialog.vue) =============

type ReadStatusRow = AnnouncementUserReadStatus & Record<string, unknown> & {__id: string};
type SortDirection = 'ascending' | 'descending';

function AnnouncementReadStatusDialog({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const {t} = useI18n();
  const [items, setItems] = useState<AnnouncementUserReadStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize());
  const [sort, setSort] = useState<Array<{sortKey: string; direction: SortDirection}>>([
    {sortKey: 'email', direction: 'ascending'},
  ]);
  const controllerRef = useRef<AbortController | null>(null);
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), []);
  const announcementId = announcement?.id ?? null;

  // Reset everything whenever the dialog opens for another announcement
  useEffect(() => {
    setItems([]);
    setTotal(0);
    setSearchInput('');
    setSearch('');
    setPage(1);
    setSort([{sortKey: 'email', direction: 'ascending'}]);
  }, [announcementId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!announcementId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const res = await adminAPI.announcements.getReadStatus(
        announcementId,
        page,
        pageSize,
        {
          search,
          sort_by: sort[0]?.sortKey || 'email',
          sort_order: sort[0]?.direction === 'descending' ? 'desc' : 'asc',
        },
        {signal: controller.signal},
      );
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (error) {
      const e = error as {name?: string; code?: string; response?: {data?: {detail?: string}}};
      if (controller.signal.aborted || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      console.error('Failed to load read status:', error);
      toast.error(e?.response?.data?.detail || t('admin.announcements.failedToLoadReadStatus'));
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }, [announcementId, page, pageSize, search, sort, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const rows = useMemo<ReadStatusRow[]>(
    () => items.map(item => ({...item, __id: String(item.user_id)})),
    [items],
  );

  const sortPlugin = useTableSortable<ReadStatusRow>({
    sort,
    onSortChange: next => {
      setSort(next.length > 0 ? next : [{sortKey: 'email', direction: 'ascending'}]);
      setPage(1);
    },
  });
  const paginationPlugin = useTablePagination<ReadStatusRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: size => {
      setPageSize(size);
      setPage(1);
      setPersistedPageSize(size);
    },
    pageSizeOptions,
  });

  const columns: TableColumn<ReadStatusRow>[] = [
    {key: 'email', header: t('common.email'), width: proportional(2), sortable: true, renderCell: row => <Text weight="medium">{row.email}</Text>},
    {key: 'username', header: t('admin.users.columns.username'), width: proportional(1.2), sortable: true, renderCell: row => <Text color="secondary">{row.username || '-'}</Text>},
    {
      key: 'balance',
      header: t('common.balance'),
      width: pixel(110),
      sortable: true,
      renderCell: row => <Text weight="medium" hasTabularNumbers>${Number(row.balance ?? 0).toFixed(2)}</Text>,
    },
    {
      key: 'eligible',
      header: t('admin.announcements.eligible'),
      width: pixel(110),
      renderCell: row => (
        <Badge variant={row.eligible ? 'success' : 'neutral'} label={row.eligible ? t('admin.announcements.eligible') : t('common.no')} />
      ),
    },
    {
      key: 'read_at',
      header: t('admin.announcements.readAt'),
      width: pixel(180),
      renderCell: row => <Text type="supporting">{row.read_at ? formatFullDateTime(row.read_at) : t('admin.announcements.unread')}</Text>,
    },
  ];

  return (
    <Dialog isOpen={announcement !== null} onOpenChange={open => !open && onClose()} width={960}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.announcements.readStatus')}
            subtitle={announcement?.title}
            onOpenChange={open => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={3} vAlign="end">
                <StackItem size="fill">
                  <TextInput
                    label={t('admin.announcements.searchUsers')}
                    isLabelHidden
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder={t('admin.announcements.searchUsers')}
                    startIcon={<Icon icon={MagnifyingGlassIcon} />}
                    hasClear
                  />
                </StackItem>
                <IconButton
                  label={t('common.refresh')}
                  tooltip={t('common.refresh')}
                  icon={<Icon icon={ArrowPathIcon} />}
                  isLoading={loading}
                  onClick={() => void load()}
                />
              </HStack>
              {loading && rows.length === 0 ? (
                <Center minHeight={200}>
                  <Spinner />
                </Center>
              ) : (
                <Table
                  data={rows}
                  columns={columns}
                  idKey="__id"
                  density="compact"
                  plugins={{sort: sortPlugin, pagination: paginationPlugin}}
                />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

// ============= PREVIEW DIALOG (port of AnnouncementPopup.vue in preview mode) =============

function AnnouncementPreviewDialog({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const {t} = useI18n();
  return (
    <Dialog isOpen={announcement !== null} onOpenChange={open => !open && onClose()} width={680} maxHeight="84dvh">
      <Layout
        header={
          <DialogHeader
            title={announcement?.title ?? ''}
            subtitle={
              announcement ? (
                <HStack gap={1.5} vAlign="center">
                  <Icon icon={ClockIcon} size="sm" color="secondary" />
                  <Text type="supporting">{formatRelativeWithDateTime(announcement.created_at)}</Text>
                </HStack>
              ) : undefined
            }
            startContent={<Badge variant="warning" label={t('announcements.unread')} />}
            onOpenChange={open => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {announcement && <Markdown density="compact">{announcement.content}</Markdown>}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="primary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

// ============= PAGE =============

export default function AdminAnnouncementsPage() {
  const {t} = useI18n();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'all'>('all');
  const [subscriptionGroups, setSubscriptionGroups] = useState<AdminGroup[]>([]);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewing, setPreviewing] = useState<Announcement | null>(null);
  const [readStatusFor, setReadStatusFor] = useState<Announcement | null>(null);
  const [formKey, setFormKey] = useState(0);

  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.announcements.list(1, 1000, {});
      setAnnouncements(res.items);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || t('admin.announcements.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Subscription groups feed the audience-targeting editor
  useEffect(() => {
    adminAPI.groups
      .getAll()
      .then(all => setSubscriptionGroups((all || []).filter(g => g.subscription_type === 'subscription')))
      .catch(error => console.error('Error loading groups:', error));
  }, []);

  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? announcements
        : announcements.filter(item => item.status === statusFilter);

    const term = query.trim().toLowerCase();
    return term === ''
      ? filtered
      : filtered.filter(item => item.title.toLowerCase().includes(term));
  }, [announcements, statusFilter, query]);

  const {sortedData, sortConfig} = useTableSortableState<AnnouncementRow>({
    data: visible as AnnouncementRow[],
    comparators: COMPARATORS,
  });
  const sortPlugin = useTableSortable<AnnouncementRow>(sortConfig);

  const openCreateDialog = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormKey(key => key + 1);
    setShowEditDialog(true);
  };

  const openEditDialog = useCallback((ann: Announcement) => {
    setEditing(ann);
    setForm({
      title: ann.title,
      content: ann.content,
      status: ann.status,
      notify_mode: ann.notify_mode || 'silent',
      starts_at_str: isoToLocalInput(ann.starts_at),
      ends_at_str: isoToLocalInput(ann.ends_at),
      targeting: ann.targeting ?? {any_of: []},
    });
    setFormKey(key => key + 1);
    setShowEditDialog(true);
  }, []);

  const closeEditDialog = () => {
    if (isSaving) return;
    setShowEditDialog(false);
    setEditing(null);
  };

  const handleSave = async () => {
    // Mirror the backend limits to avoid ANNOUNCEMENT_INVALID_TARGET
    const targetingError = targetingValidationError(form.targeting, t);
    if (targetingError) {
      toast.error(targetingError);
      return;
    }
    setIsSaving(true);
    try {
      const startsAt = parseDateTimeLocalInput(form.starts_at_str);
      const endsAt = parseDateTimeLocalInput(form.ends_at_str);

      if (!editing) {
        await adminAPI.announcements.create({
          title: form.title,
          content: form.content,
          status: form.status,
          notify_mode: form.notify_mode,
          targeting: form.targeting,
          starts_at: startsAt ?? undefined,
          ends_at: endsAt ?? undefined,
        });
      } else {
        // Only send changed fields; 0 clears a start/end time
        const payload: Record<string, unknown> = {};
        if (form.title !== editing.title) payload.title = form.title;
        if (form.content !== editing.content) payload.content = form.content;
        if (form.status !== editing.status) payload.status = form.status;
        if (form.notify_mode !== (editing.notify_mode || 'silent')) payload.notify_mode = form.notify_mode;
        if (startsAt !== isoToUnix(editing.starts_at)) payload.starts_at = startsAt === null ? 0 : startsAt;
        if (endsAt !== isoToUnix(editing.ends_at)) payload.ends_at = endsAt === null ? 0 : endsAt;
        if (JSON.stringify(form.targeting ?? {}) !== JSON.stringify(editing.targeting ?? {})) {
          payload.targeting = form.targeting;
        }
        await adminAPI.announcements.update(editing.id, payload);
      }
      toast.success(t('common.success'));
      setShowEditDialog(false);
      setEditing(null);
      loadAnnouncements();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail ||
          err?.message ||
          t(editing ? 'admin.announcements.failedToUpdate' : 'admin.announcements.failedToCreate'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await adminAPI.announcements.delete(deleting.id);
      toast.success(t('common.success'));
      setDeleting(null);
      loadAnnouncements();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || t('admin.announcements.failedToDelete'));
    } finally {
      setIsDeleting(false);
    }
  };

  const clearEverything = () => {
    setQuery('');
    setStatusFilter('all');
  };

  const columns = useMemo(
    () => getColumns(t, setPreviewing, setReadStatusFor, openEditDialog, setDeleting),
    [t, openEditDialog],
  );

  return (
    <>
      <Layout
        height="fill"
        contentWidth={1200}
        content={
        <LayoutContent>
          <VStack gap={6} padding={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={2}>
                  <Heading level={1}>{t('admin.announcements.title')}</Heading>
                  <Text color="secondary">{t('admin.announcements.description')}</Text>
                </VStack>
              </StackItem>
              <IconButton
                label={t('common.refresh')}
                tooltip={t('common.refresh')}
                icon={<Icon icon={ArrowPathIcon} />}
                isLoading={loading}
                onClick={() => void loadAnnouncements()}
              />
              <Button
                label={t('admin.announcements.createAnnouncement')}
                variant="primary"
                icon={<Icon icon={PlusIcon} />}
                onClick={openCreateDialog}
              />
            </HStack>

            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <SegmentedControl
                label={t('admin.announcements.columns.status')}
                value={statusFilter}
                onChange={value => setStatusFilter(value as AnnouncementStatus | 'all')}>
                {STATUS_FILTERS.map(filter => (
                  <SegmentedControlItem
                    key={filter.value}
                    value={filter.value}
                    label={t(filter.labelKey)}
                  />
                ))}
              </SegmentedControl>
              <VStack width={300}>
                <TextInput
                  label={t('admin.announcements.searchAnnouncements')}
                  isLabelHidden
                  value={query}
                  onChange={setQuery}
                  placeholder={t('admin.announcements.searchAnnouncements')}
                  startIcon={<Icon icon={MagnifyingGlassIcon} />}
                />
              </VStack>
            </HStack>

            {loading && announcements.length === 0 ? (
              <Center minHeight={240}>
                <Spinner />
              </Center>
            ) : visible.length === 0 ? (
              <EmptyState
                title={t('admin.announcements.noAnnouncements')}
                description={t('admin.announcements.noAnnouncementsDesc')}
                actions={
                  query || statusFilter !== 'all' ? (
                    <Button
                      label={t('common.clearFilters')}
                      variant="secondary"
                      onClick={clearEverything}
                    />
                  ) : (
                    <Button
                      label={t('admin.announcements.createAnnouncement')}
                      variant="primary"
                      onClick={openCreateDialog}
                    />
                  )
                }
              />
            ) : (
              <Table
                data={sortedData}
                columns={columns}
                idKey="id"
                density="balanced"
                dividers="rows"
                hasHover
                plugins={{sort: sortPlugin}}
              />
            )}
          </VStack>
        </LayoutContent>
      }
    />

    {/* Create / edit */}
    <Dialog isOpen={showEditDialog} onOpenChange={isOpen => !isOpen && closeEditDialog()} width={880} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={editing ? t('admin.announcements.editAnnouncement') : t('admin.announcements.createAnnouncement')}
            onOpenChange={isOpen => !isOpen && closeEditDialog()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <TextInput
                label={t('admin.announcements.form.title')}
                value={form.title}
                onChange={val => setForm(prev => ({...prev, title: val}))}
                isRequired
              />
              <TextArea
                label={t('admin.announcements.form.content')}
                value={form.content}
                onChange={val => setForm(prev => ({...prev, content: val}))}
                rows={6}
                isRequired
              />
              <Grid columns={{minWidth: 280, max: 2}} gap={4}>
                <Selector
                  label={t('admin.announcements.form.status')}
                  value={form.status}
                  onChange={val => setForm(prev => ({...prev, status: val as AnnouncementStatus}))}
                  options={[
                    {value: 'draft', label: t('admin.announcements.statusLabels.draft')},
                    {value: 'active', label: t('admin.announcements.statusLabels.active')},
                    {value: 'archived', label: t('admin.announcements.statusLabels.archived')},
                  ]}
                />
                <Selector
                  label={t('admin.announcements.form.notifyMode')}
                  description={t('admin.announcements.form.notifyModeHint')}
                  value={form.notify_mode}
                  onChange={val => setForm(prev => ({...prev, notify_mode: val as AnnouncementNotifyMode}))}
                  options={[
                    {value: 'silent', label: t('admin.announcements.notifyModeLabels.silent')},
                    {value: 'popup', label: t('admin.announcements.notifyModeLabels.popup')},
                  ]}
                />
                <DateTimeInput
                  label={t('admin.announcements.form.startsAt')}
                  description={t('admin.announcements.form.startsAtHint')}
                  value={(form.starts_at_str || undefined) as ISODateTimeString | undefined}
                  onChange={val => setForm(prev => ({...prev, starts_at_str: val ?? ''}))}
                  max={'9999-12-31T23:59' as ISODateTimeString}
                  hasClear
                />
                <DateTimeInput
                  label={t('admin.announcements.form.endsAt')}
                  description={t('admin.announcements.form.endsAtHint')}
                  value={(form.ends_at_str || undefined) as ISODateTimeString | undefined}
                  onChange={val => setForm(prev => ({...prev, ends_at_str: val ?? ''}))}
                  max={'9999-12-31T23:59' as ISODateTimeString}
                  hasClear
                />
              </Grid>
              <AnnouncementTargetingEditor
                key={formKey}
                value={form.targeting}
                onChange={targeting => setForm(prev => ({...prev, targeting}))}
                groups={subscriptionGroups}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label={t('common.cancel')}
                variant="secondary"
                isDisabled={isSaving}
                onClick={closeEditDialog}
              />
              <Button
                label={isSaving ? t('common.saving') : t('common.save')}
                variant="primary"
                onClick={handleSave}
                isLoading={isSaving}
                isDisabled={!form.title.trim() || !form.content.trim()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>

    <AlertDialog
      isOpen={deleting !== null}
      onOpenChange={isOpen => !isOpen && !isDeleting && setDeleting(null)}
      title={t('admin.announcements.deleteAnnouncement')}
      description={t('admin.announcements.deleteConfirm')}
      actionLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      isActionLoading={isDeleting}
      onAction={() => void confirmDelete()}
    />

    <AnnouncementReadStatusDialog announcement={readStatusFor} onClose={() => setReadStatusFor(null)} />
    <AnnouncementPreviewDialog announcement={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}
