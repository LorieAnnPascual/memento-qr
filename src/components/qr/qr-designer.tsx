'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { QRCode } from '@/lib/db/schema';
import { DEFAULT_QR_STYLE, type QRStyleConfig } from '@/lib/qr/generator';
import { getFormValidationError } from '@/lib/qr/form-validation';
import { buildPayloadForType } from '@/lib/qr/payloads';
import { buildRedirectUrl } from '@/lib/qr/short-code';
import { getVCardSocialLinks, type SocialLink } from '@/lib/qr/social-badges';
import { WHATSAPP_DEFAULT_STYLE } from '@/lib/qr/whatsapp-preset';
import { QR_FORM_DEFAULTS, type QRFormValuesMap, type QRType } from '@/types/qr';

import { QRExport } from './qr-export';
import { QRLayoutPicker } from './qr-layout-picker';
import { QRPreview } from './qr-preview';
import { QRStyleEditor } from './qr-style-editor';
import { QRTemplatePicker } from './qr-template-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QRTypeSelector } from './qr-type-selector';
import { UrlForm } from './qr-type-forms/url-form';
import { TextForm } from './qr-type-forms/text-form';
import { PhoneForm } from './qr-type-forms/phone-form';
import { SmsForm } from './qr-type-forms/sms-form';
import { EmailForm } from './qr-type-forms/email-form';
import { WifiForm } from './qr-type-forms/wifi-form';
import { VCardForm } from './qr-type-forms/vcard-form';
import { WhatsAppForm } from './qr-type-forms/whatsapp-form';
import { EventForm } from './qr-type-forms/event-form';
import { LocationForm } from './qr-type-forms/location-form';
import { SocialForm } from './qr-type-forms/social-form';

/** Converts a stored UTC timestamp into the local-time string a `datetime-local` input expects. */
function toDateTimeLocalValue(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function QRTypeForm({
  type,
  formValues,
  onChangeValues,
}: {
  type: QRType;
  formValues: QRFormValuesMap;
  onChangeValues: <T extends QRType>(type: T, values: QRFormValuesMap[T]) => void;
}) {
  switch (type) {
    case 'url':
      return <UrlForm values={formValues.url} onChange={(v) => onChangeValues('url', v)} />;
    case 'text':
      return <TextForm values={formValues.text} onChange={(v) => onChangeValues('text', v)} />;
    case 'phone':
      return <PhoneForm values={formValues.phone} onChange={(v) => onChangeValues('phone', v)} />;
    case 'sms':
      return <SmsForm values={formValues.sms} onChange={(v) => onChangeValues('sms', v)} />;
    case 'email':
      return <EmailForm values={formValues.email} onChange={(v) => onChangeValues('email', v)} />;
    case 'wifi':
      return <WifiForm values={formValues.wifi} onChange={(v) => onChangeValues('wifi', v)} />;
    case 'vcard':
      return <VCardForm values={formValues.vcard} onChange={(v) => onChangeValues('vcard', v)} />;
    case 'whatsapp':
      return (
        <WhatsAppForm values={formValues.whatsapp} onChange={(v) => onChangeValues('whatsapp', v)} />
      );
    case 'event':
      return <EventForm values={formValues.event} onChange={(v) => onChangeValues('event', v)} />;
    case 'location':
      return (
        <LocationForm values={formValues.location} onChange={(v) => onChangeValues('location', v)} />
      );
    case 'social':
      return <SocialForm values={formValues.social} onChange={(v) => onChangeValues('social', v)} />;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}

interface QRDesignerProps {
  initialQrCode?: QRCode;
  initialStyle?: QRStyleConfig;
  /** The user's folders; the folder picker only appears when there are some. */
  folders?: { id: string; name: string }[];
}

const NO_FOLDER = 'none';

export function QRDesigner({ initialQrCode, initialStyle, folders = [] }: QRDesignerProps) {
  const router = useRouter();
  const [folderId, setFolderId] = useState(initialQrCode?.folderId ?? NO_FOLDER);
  const [name, setName] = useState(initialQrCode?.name ?? '');
  const [type, setType] = useState<QRType>((initialQrCode?.qrType as QRType) ?? 'url');
  const [formValues, setFormValues] = useState<QRFormValuesMap>(() => {
    if (!initialQrCode) return QR_FORM_DEFAULTS;
    const initialType = initialQrCode.qrType as QRType;
    return {
      ...QR_FORM_DEFAULTS,
      [initialType]: {
        ...QR_FORM_DEFAULTS[initialType],
        ...(initialQrCode.payloadFields as Record<string, unknown> | null),
      },
    };
  });
  const [style, setStyle] = useState<QRStyleConfig>(
    (initialQrCode?.styleConfig as QRStyleConfig) ?? initialStyle ?? DEFAULT_QR_STYLE,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const [isDynamic, setIsDynamic] = useState(initialQrCode?.isDynamic ?? false);
  const [isPaused, setIsPaused] = useState(initialQrCode?.isPaused ?? false);
  const [expiresAt, setExpiresAt] = useState(() => toDateTimeLocalValue(initialQrCode?.expiresAt ?? null));
  const [scanLimit, setScanLimit] = useState(initialQrCode?.scanLimit?.toString() ?? '');
  const [copied, setCopied] = useState(false);

  const contentPayload = useMemo(() => {
    try {
      return buildPayloadForType(type, formValues[type]);
    } catch (error) {
      console.error('Failed to build QR payload:', error);
      return '';
    }
  }, [type, formValues]);

  // A dynamic QR's printed code must never change, even as the underlying
  // content is edited — it always encodes the stable short link. That link
  // only exists once the code has been saved at least once as dynamic.
  const shortLink = isDynamic && initialQrCode?.shortCode ? buildRedirectUrl(initialQrCode.shortCode) : null;
  const payload = shortLink ?? contentPayload;

  const socialLinks: SocialLink[] = useMemo(() => {
    if (type === 'vcard') return getVCardSocialLinks(formValues.vcard);
    if (type === 'social') return formValues.social.links.filter((link) => link.url.trim());
    return [];
  }, [type, formValues]);

  function handleChangeValues<T extends QRType>(nextType: T, values: QRFormValuesMap[T]): void {
    setFormValues((prev) => ({ ...prev, [nextType]: values }));
  }

  async function handleCopyShortLink(): Promise<void> {
    if (!shortLink) return;
    try {
      await navigator.clipboard.writeText(shortLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy the link.');
      console.error('Clipboard copy error:', error);
    }
  }

  function handleSaveClick(): void {
    if (!name.trim()) {
      toast.error('Give this QR code a name before saving.');
      return;
    }
    const validationError = getFormValidationError(type, formValues[type]);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!contentPayload) {
      toast.error('Fill in the QR content before saving.');
      return;
    }
    setShowSaveConfirm(true);
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      const body = {
        name: name.trim(),
        qrType: type,
        // Always the built content — the server decides whether this
        // becomes the encoded payload directly (static) or the redirect
        // target (dynamic).
        payload: contentPayload,
        payloadFields: formValues[type],
        styleConfig: style,
        isDynamic,
        folderId: folderId === NO_FOLDER ? null : folderId,
        ...(initialQrCode && { isPaused }),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        scanLimit: scanLimit.trim() ? Number.parseInt(scanLimit, 10) : null,
      };

      const response = await fetch(
        initialQrCode ? `/api/qr/${initialQrCode.id}` : '/api/qr',
        {
          method: initialQrCode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error('Request failed');
      }

      toast.success(initialQrCode ? 'QR code updated' : 'QR code saved');
      setShowSaveConfirm(false);

      // Stay on the QR after saving so dynamic-QR details (short link, scan
      // count) are visible right away. A brand-new QR moves to its own edit
      // page; an existing one just reloads its saved data in place.
      if (initialQrCode) {
        router.refresh();
      } else {
        const created = (await response.json().catch(() => null)) as { id?: string } | null;
        if (created?.id) {
          router.replace(`/qr/${created.id}`);
        } else {
          router.push('/qr');
        }
        router.refresh();
      }
    } catch (error) {
      toast.error('Failed to save QR code. Please try again.');
      console.error('QR save error:', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="qr-name">Name</Label>
            <Input
              id="qr-name"
              placeholder="e.g. Office WiFi, Business Card"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {folders.length > 0 && (
            <div className="w-full space-y-2 sm:w-48">
              <Label htmlFor="qr-folder">Folder</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger id="qr-folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <QRExport
            config={{ data: payload, ...style }}
            fileName={name || 'qr-code'}
            title={name}
            socialLinks={socialLinks}
          />
          <Button type="button" onClick={handleSaveClick} disabled={isSaving}>
            {isSaving ? 'Saving…' : initialQrCode ? 'Save changes' : 'Save QR code'}
          </Button>
        </div>
      </div>

      <QRTypeSelector value={type} onChange={setType} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>Fill in the details for this QR code.</CardDescription>
            </CardHeader>
            <CardContent>
              <QRTypeForm type={type} formValues={formValues} onChangeValues={handleChangeValues} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dynamic QR</CardTitle>
              <CardDescription>
                Encode a short link that you can repoint anytime, without reprinting the code.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch id="qr-dynamic" checked={isDynamic} onCheckedChange={setIsDynamic} />
                <Label htmlFor="qr-dynamic">Make this dynamic</Label>
              </div>

              {isDynamic && (
                <div className="space-y-4 border-t pt-4">
                  {shortLink ? (
                    <div className="space-y-2">
                      <Label>Short link</Label>
                      <div className="flex items-center gap-2">
                        <Input value={shortLink} readOnly className="font-mono text-xs" />
                        <Button type="button" variant="outline" size="icon" onClick={handleCopyShortLink}>
                          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This is what the QR code encodes. Editing the content above updates where it
                        redirects to — the printed code stays the same.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      A short link will be generated the first time you save.
                    </p>
                  )}

                  {initialQrCode && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Switch id="qr-paused" checked={isPaused} onCheckedChange={setIsPaused} />
                        <Label htmlFor="qr-paused">Paused</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {initialQrCode.scanCount} scan{initialQrCode.scanCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="qr-expires-at">Expires (optional)</Label>
                      <Input
                        id="qr-expires-at"
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qr-scan-limit">Scan limit (optional)</Label>
                      <Input
                        id="qr-scan-limit"
                        type="number"
                        min={1}
                        placeholder="Unlimited"
                        value={scanLimit}
                        onChange={(event) => setScanLimit(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Layout</CardTitle>
              <CardDescription>Show just the QR code, or wrap it in a printable card.</CardDescription>
            </CardHeader>
            <CardContent>
              <QRLayoutPicker value={style} onChange={setStyle} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-start justify-between">
              <div>
                <CardTitle>Style</CardTitle>
                <CardDescription>Customize how the QR code looks.</CardDescription>
              </div>
              <div className="flex gap-2">
                {type === 'whatsapp' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStyle((prev) => ({ ...prev, ...WHATSAPP_DEFAULT_STYLE }))}
                  >
                    Use WhatsApp design
                  </Button>
                )}
                <QRTemplatePicker
                  currentStyle={style}
                  onApply={(applied) => setStyle((prev) => ({ ...prev, ...applied }))}
                />
              </div>
            </CardHeader>
            <CardContent>
              <QRStyleEditor value={style} onChange={setStyle} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Updates live as you type.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <QRPreview
                config={{ data: payload, ...style }}
                title={name || undefined}
                caption={style.cardCaption}
                socialLinks={socialLinks}
              />
              <pre
                data-testid="qr-payload-preview"
                className="w-full overflow-x-auto rounded-lg border border-input bg-muted/50 p-3 text-xs break-all whitespace-pre-wrap text-muted-foreground"
              >
                {payload || '—'}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title={initialQrCode ? 'Save changes to this QR code?' : 'Save this QR code?'}
        description={
          initialQrCode
            ? 'This will overwrite the saved version with your current changes.'
            : `"${name}" will be added to your QR codes.`
        }
        confirmLabel={initialQrCode ? 'Save changes' : 'Save QR code'}
        pendingLabel="Saving…"
        isPending={isSaving}
        onConfirm={handleSave}
      />
    </div>
  );
}
