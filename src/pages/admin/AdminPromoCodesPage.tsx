import { toAppPath } from '@/utils/appPath'
// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Admin Promo Codes Management - Searchable table template
 *
 * Manages promotional codes with status filtering, search, and CRUD operations.
 */

import {useCallback, useEffect, useMemo, useState} from 'react';
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
import {Center} from '@astryxdesign/core/Center';
import {Spinner} from '@astryxdesign/core/Spinner';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {DateTimeInput, type ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  EyeIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

import {toast} from '~/lib/toast';
import {copyToClipboard} from '~/lib/clipboard';
import {adminAPI} from '~/lib/api/admin';
import {formatDateTime as formatFullDateTime, formatDateTimeLocalInput, parseDateTimeLocalInput} from '@/utils/format';
import type {PromoCode, PromoCodeUsage} from '@/types';

// ============= DATA TYPES =============

type PromoCodeStatus = 'active' | 'disabled';
type PromoRow = PromoCode & Record<string, unknown>;

interface PromoCodeForm {
  code: string;
  bonus_amount: number;
  max_uses: number;
  status?: PromoCodeStatus;
  expires_at_str: string;
  notes: string;
}

const USAGES_PAGE_SIZE_OPTIONS = [10, 20, 50];

// ============= FORMATTING =============

function formatDateTime(iso: string): string {
  return formatFullDateTime(iso);
}

function isoToLocalInput(iso: string): string {
  return formatDateTimeLocalInput(Math.floor(new Date(iso).getTime() / 1000));
}

const errorDetail = (err: unknown): string | undefined => {
  const e = err as {response?: {data?: {detail?: string}}; message?: string};
  return e?.response?.data?.detail || e?.message;
};

const isExpired = (item: PromoCode) => !!item.expires_at && new Date(item.expires_at) < new Date();
const isUsedUp = (item: PromoCode) => item.max_uses > 0 && item.used_count >= item.max_uses;

// Shareable registration URL that pre-fills this promo code
const buildRegisterLink = (code: string) => `${window.location.origin}${toAppPath('/register')}?promo=${encodeURIComponent(code)}`;

// ============= COLUMNS =============

function getColumns(
  t: (key: string, params?: Record<string, unknown>) => string,
  onEdit: (code: PromoCode) => void,
  onDelete: (code: PromoCode) => void,
  onCopy: (code: string) => void,
  onCopyRegisterLink: (code: PromoCode) => void,
  onViewUsages: (code: PromoCode) => void,
): TableColumn<PromoRow>[] {
  const statusLabel = (item: PromoCode) => {
    if (isExpired(item)) return t('admin.promo.statusExpired');
    if (isUsedUp(item)) return t('admin.promo.statusMaxUsed');
    return item.status === 'active' ? t('admin.promo.statusActive') : t('admin.promo.statusDisabled');
  };
  const statusVariant = (item: PromoCode) => {
    if (isExpired(item)) return 'error' as const;
    if (isUsedUp(item)) return 'neutral' as const;
    return item.status === 'active' ? ('success' as const) : ('neutral' as const);
  };
  return [
    {
      key: 'code',
      header: t('admin.promo.columns.code'),
      width: proportional(2),
      sortable: true,
      renderCell: (item: PromoRow) => (
        <HStack gap={2} vAlign="center">
          <Text type="code" weight="medium">{item.code}</Text>
          <IconButton
            label={t('common.copy')}
            tooltip={t('common.copy')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={DocumentDuplicateIcon} />}
            onClick={() => onCopy(item.code)}
          />
        </HStack>
      ),
    },
    {
      key: 'bonus_amount',
      header: t('admin.promo.columns.bonusAmount'),
      width: pixel(120),
      align: 'end',
      sortable: true,
      renderCell: (item: PromoRow) => (
        <Text hasTabularNumbers>${item.bonus_amount.toFixed(2)}</Text>
      ),
    },
    {
      key: 'usage',
      header: t('admin.promo.columns.usage'),
      width: pixel(100),
      align: 'end',
      renderCell: (item: PromoRow) => (
        <Text color="secondary" hasTabularNumbers>
          {item.used_count} / {item.max_uses === 0 ? '∞' : item.max_uses}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('admin.promo.columns.status'),
      width: pixel(110),
      sortable: true,
      renderCell: (item: PromoRow) => <Badge variant={statusVariant(item)} label={statusLabel(item)} />,
    },
    {
      key: 'expires_at',
      header: t('admin.promo.columns.expiresAt'),
      width: pixel(180),
      sortable: true,
      renderCell: (item: PromoRow) => (
        <Text color="secondary">
          {item.expires_at ? formatDateTime(item.expires_at) : t('admin.promo.neverExpires')}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('admin.promo.columns.actions'),
      width: pixel(184),
      align: 'end',
      renderCell: (item: PromoRow) => (
        <HStack gap={1} hAlign="end">
          <IconButton
            label={t('admin.promo.copyRegisterLink')}
            tooltip={t('admin.promo.copyRegisterLink')}
            variant="ghost"
            icon={<Icon icon={LinkIcon} />}
            onClick={() => onCopyRegisterLink(item)}
          />
          <IconButton
            label={t('admin.promo.viewUsages')}
            tooltip={t('admin.promo.viewUsages')}
            variant="ghost"
            icon={<Icon icon={EyeIcon} />}
            onClick={() => onViewUsages(item)}
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

const COMPARATORS: Partial<Record<string, TableSortComparator<PromoRow>>> = {
  code: (a, b) => a.code.localeCompare(b.code),
  bonus_amount: (a, b) => a.bonus_amount - b.bonus_amount,
  status: (a, b) => a.status.localeCompare(b.status),
  expires_at: (a, b) => {
    if (!a.expires_at && !b.expires_at) return 0;
    if (!a.expires_at) return 1;
    if (!b.expires_at) return -1;
    return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
  },
};

// ============= STATUS FILTERS =============

const STATUS_FILTERS: {value: PromoCodeStatus | 'all'; labelKey: string}[] = [
  {value: 'all', labelKey: 'admin.promo.allStatus'},
  {value: 'active', labelKey: 'admin.promo.statusActive'},
  {value: 'disabled', labelKey: 'admin.promo.statusDisabled'},
];

// ============= USAGE RECORDS DIALOG =============

type UsageRow = PromoCodeUsage & Record<string, unknown> & {__id: string};

function PromoUsagesDialog({code, onClose}: {code: PromoCode | null; onClose: () => void}) {
  const {t} = useI18n();
  const [usages, setUsages] = useState<PromoCodeUsage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const codeId = code?.id ?? null;

  useEffect(() => {
    setPage(1);
    setUsages([]);
    setTotal(0);
  }, [codeId]);

  useEffect(() => {
    if (!codeId) return;
    let cancelled = false;
    setLoading(true);
    setUsages([]);
    adminAPI.promo
      .getUsages(codeId, page, pageSize)
      .then(response => {
        if (cancelled) return;
        setUsages(response.items);
        setTotal(response.total);
      })
      .catch(error => {
        if (!cancelled) toast.error(errorDetail(error) || t('admin.promo.failedToLoadUsages'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [codeId, page, pageSize, t]);

  const rows = useMemo<UsageRow[]>(() => usages.map(u => ({...u, __id: String(u.id)})), [usages]);
  const paginationPlugin = useTablePagination<UsageRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: size => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: USAGES_PAGE_SIZE_OPTIONS,
  });
  const columns: TableColumn<UsageRow>[] = [
    {
      key: 'user',
      header: t('astryx.promoAdmin.usageUser'),
      width: proportional(2),
      renderCell: row => (
        <VStack gap={0.5}>
          <Text weight="medium">{row.user?.email || t('admin.promo.userPrefix', {id: row.user_id})}</Text>
          <Text type="supporting">{formatDateTime(row.used_at)}</Text>
        </VStack>
      ),
    },
    {
      key: 'bonus_amount',
      header: t('admin.promo.columns.bonusAmount'),
      width: pixel(130),
      align: 'end',
      renderCell: row => (
        <Text weight="medium" hasTabularNumbers>
          +${row.bonus_amount.toFixed(2)}
        </Text>
      ),
    },
  ];

  return (
    <Dialog isOpen={code !== null} onOpenChange={open => !open && onClose()} width={720}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.promo.usageRecords')}
            subtitle={code?.code}
            onOpenChange={open => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {loading ? (
              <Center minHeight={160}>
                <Spinner />
              </Center>
            ) : rows.length === 0 ? (
              <EmptyState isCompact title={t('admin.promo.noUsages')} />
            ) : (
              <Table
                data={rows}
                columns={columns}
                idKey="__id"
                density="compact"
                plugins={total > pageSize ? {pagination: paginationPlugin} : undefined}
              />
            )}
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

// ============= PROMO FORM FIELDS =============

function PromoFormFields({
  form,
  onChange,
  isEdit,
}: {
  form: PromoCodeForm;
  onChange: (patch: Partial<PromoCodeForm>) => void;
  isEdit: boolean;
}) {
  const {t} = useI18n();
  return (
    <VStack gap={4} hAlign="stretch">
      <TextInput
        label={t('admin.promo.code')}
        description={isEdit ? undefined : t('admin.promo.autoGenerate')}
        value={form.code}
        onChange={val => onChange({code: val.toUpperCase()})}
        placeholder={isEdit ? undefined : t('admin.promo.codePlaceholder')}
        autoCapitalize="characters"
        hasSpellCheck={false}
      />
      <HStack gap={3}>
        <StackItem size="fill">
          <NumberInput
            label={t('admin.promo.bonusAmount')}
            value={form.bonus_amount}
            onChange={val => onChange({bonus_amount: val})}
            min={0}
            step={0.01}
            isRequired
          />
        </StackItem>
        <StackItem size="fill">
          <NumberInput
            label={t('admin.promo.maxUses')}
            description={t('admin.promo.zeroUnlimited')}
            value={form.max_uses}
            onChange={val => onChange({max_uses: val})}
            min={0}
            isIntegerOnly
          />
        </StackItem>
      </HStack>
      {isEdit && (
        <Selector
          label={t('admin.promo.status')}
          value={form.status ?? 'active'}
          onChange={val => onChange({status: val as PromoCodeStatus})}
          options={[
            {value: 'active', label: t('admin.promo.statusActive')},
            {value: 'disabled', label: t('admin.promo.statusDisabled')},
          ]}
        />
      )}
      <DateTimeInput
        label={t('admin.promo.expiresAt')}
        value={(form.expires_at_str || undefined) as ISODateTimeString | undefined}
        onChange={val => onChange({expires_at_str: val ?? ''})}
        hasClear
      />
      <TextInput
        label={t('admin.promo.notes')}
        value={form.notes}
        onChange={val => onChange({notes: val})}
        placeholder={t('admin.promo.notesPlaceholder')}
      />
    </VStack>
  );
}

// ============= PAGE =============

export default function AdminPromoCodesPage() {
  const {t} = useI18n();

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromoCodeStatus | 'all'>('all');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState<PromoCode | null>(null);
  const [usagesFor, setUsagesFor] = useState<PromoCode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [createForm, setCreateForm] = useState<PromoCodeForm>({
    code: '',
    bonus_amount: 1,
    max_uses: 0,
    expires_at_str: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState<PromoCodeForm>({
    code: '',
    bonus_amount: 0,
    max_uses: 0,
    status: 'active',
    expires_at_str: '',
    notes: '',
  });

  const loadCodes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.promo.list(1, 1000, {});
      setCodes(res.items);
    } catch (err) {
      toast.error(errorDetail(err) || t('admin.promo.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? codes
        : codes.filter(item => item.status === statusFilter);

    const term = query.trim().toLowerCase();
    return term === ''
      ? filtered
      : filtered.filter(item => item.code.toLowerCase().includes(term));
  }, [codes, statusFilter, query]);

  const {sortedData, sortConfig} = useTableSortableState<PromoRow>({
    data: visible as PromoRow[],
    comparators: COMPARATORS,
  });
  const sortPlugin = useTableSortable<PromoRow>(sortConfig);

  const openCreateDialog = () => {
    setCreateForm({
      code: '',
      bonus_amount: 1,
      max_uses: 0,
      expires_at_str: '',
      notes: '',
    });
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const expiresAt = parseDateTimeLocalInput(createForm.expires_at_str);
      await adminAPI.promo.create({
        code: createForm.code || undefined,
        bonus_amount: createForm.bonus_amount,
        max_uses: createForm.max_uses,
        expires_at: expiresAt ?? undefined,
        notes: createForm.notes || undefined,
      });
      toast.success(t('admin.promo.codeCreated'));
      setShowCreateDialog(false);
      loadCodes();
    } catch (err) {
      toast.error(errorDetail(err) || t('admin.promo.failedToCreate'));
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = useCallback((code: PromoCode) => {
    setEditing(code);
    setEditForm({
      code: code.code,
      bonus_amount: code.bonus_amount,
      max_uses: code.max_uses,
      status: code.status,
      expires_at_str: code.expires_at ? isoToLocalInput(code.expires_at) : '',
      notes: code.notes || '',
    });
  }, []);

  const handleUpdate = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      await adminAPI.promo.update(editing.id, {
        code: editForm.code,
        bonus_amount: editForm.bonus_amount,
        max_uses: editForm.max_uses,
        status: editForm.status!,
        expires_at: parseDateTimeLocalInput(editForm.expires_at_str) ?? 0,
        notes: editForm.notes,
      });
      toast.success(t('admin.promo.codeUpdated'));
      setEditing(null);
      loadCodes();
    } catch (err) {
      toast.error(errorDetail(err) || t('admin.promo.failedToUpdate'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await adminAPI.promo.delete(deleting.id);
      toast.success(t('admin.promo.codeDeleted'));
      setDeleting(null);
      loadCodes();
    } catch (err) {
      toast.error(errorDetail(err) || t('admin.promo.failedToDelete'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopy = useCallback(
    (code: string) => void copyToClipboard(code, t('admin.promo.copied')),
    [t],
  );

  const handleCopyRegisterLink = useCallback(
    (code: PromoCode) => void copyToClipboard(buildRegisterLink(code.code), t('admin.promo.registerLinkCopied')),
    [t],
  );

  const clearEverything = () => {
    setQuery('');
    setStatusFilter('all');
  };

  const columns = useMemo(
    () => getColumns(t, openEditDialog, setDeleting, handleCopy, handleCopyRegisterLink, setUsagesFor),
    [t, openEditDialog, handleCopy, handleCopyRegisterLink],
  );

  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent>
          <VStack gap={6} padding={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={2}>
                  <Heading level={1}>{t('admin.promo.title')}</Heading>
                  <Text color="secondary">{t('admin.promo.description')}</Text>
                </VStack>
              </StackItem>
              <Button
                label={t('admin.promo.createCode')}
                variant="primary"
                icon={<Icon icon={PlusIcon} />}
                onClick={openCreateDialog}
              />
            </HStack>

            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <SegmentedControl
                label={t('admin.promo.columns.status')}
                value={statusFilter}
                onChange={value => setStatusFilter(value as PromoCodeStatus | 'all')}>
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
                  label={t('admin.promo.searchCodes')}
                  isLabelHidden
                  value={query}
                  onChange={setQuery}
                  placeholder={t('admin.promo.searchCodes')}
                  startIcon={<Icon icon={MagnifyingGlassIcon} />}
                />
              </VStack>
            </HStack>

            {isLoading && codes.length === 0 ? (
              <Center minHeight={240}>
                <Spinner />
              </Center>
            ) : visible.length === 0 ? (
              <EmptyState
                title={t('admin.promo.noCodesYet')}
                description={t('admin.promo.createFirstCode')}
                actions={
                  query || statusFilter !== 'all' ? (
                    <Button
                      label={t('common.clearFilters')}
                      variant="secondary"
                      onClick={clearEverything}
                    />
                  ) : (
                    <Button
                      label={t('admin.promo.createCode')}
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
                plugins={{
                  sort: sortPlugin,
                }}
              />
            )}
          </VStack>

          <Dialog
            isOpen={showCreateDialog}
            onOpenChange={open => !open && !isSaving && setShowCreateDialog(false)}
            width={480}
            purpose="form">
            <Layout
              header={
                <DialogHeader
                  title={t('admin.promo.createCode')}
                  onOpenChange={open => !open && !isSaving && setShowCreateDialog(false)}
                />
              }
              content={
                <LayoutContent>
                  <PromoFormFields
                    form={createForm}
                    onChange={patch => setCreateForm(prev => ({...prev, ...patch}))}
                    isEdit={false}
                  />
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <HStack gap={2} hAlign="end">
                    <Button
                      label={t('common.cancel')}
                      variant="secondary"
                      isDisabled={isSaving}
                      onClick={() => setShowCreateDialog(false)}
                    />
                    <Button
                      label={isSaving ? t('common.creating') : t('common.create')}
                      variant="primary"
                      onClick={handleCreate}
                      isLoading={isSaving}
                    />
                  </HStack>
                </LayoutFooter>
              }
            />
          </Dialog>

          <Dialog
            isOpen={editing !== null}
            onOpenChange={open => !open && !isSaving && setEditing(null)}
            width={480}
            purpose="form">
            <Layout
              header={
                <DialogHeader
                  title={t('admin.promo.editCode')}
                  onOpenChange={open => !open && !isSaving && setEditing(null)}
                />
              }
              content={
                <LayoutContent>
                  <PromoFormFields
                    form={editForm}
                    onChange={patch => setEditForm(prev => ({...prev, ...patch}))}
                    isEdit
                  />
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <HStack gap={2} hAlign="end">
                    <Button
                      label={t('common.cancel')}
                      variant="secondary"
                      isDisabled={isSaving}
                      onClick={() => setEditing(null)}
                    />
                    <Button
                      label={isSaving ? t('common.saving') : t('common.save')}
                      variant="primary"
                      onClick={handleUpdate}
                      isLoading={isSaving}
                    />
                  </HStack>
                </LayoutFooter>
              }
            />
          </Dialog>

          <AlertDialog
            isOpen={deleting !== null}
            onOpenChange={open => !open && !isDeleting && setDeleting(null)}
            title={t('admin.promo.deleteCode')}
            description={t('admin.promo.deleteCodeConfirm')}
            actionLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            isActionLoading={isDeleting}
            onAction={() => void confirmDelete()}
          />

          <PromoUsagesDialog code={usagesFor} onClose={() => setUsagesFor(null)} />
        </LayoutContent>
      }
    />
  );
}
