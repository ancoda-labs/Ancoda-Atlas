'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import type { Lang } from '@/hooks/use-flood-lang';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// "Report" in the masthead, on every page of the desk.
//
// Someone standing on a washed-out road is not going to navigate to a tab and
// scroll to a form. The button follows them across the desk and opens the whole
// flow in one dialog: pick or take a photo, say what it shows, send.
//
// The upload contract is the same one the ground-reports page uses
// (POST /api/flood/photos), so both routes into the feature agree on safety
// acknowledgement, EXIF stripping and rate limiting rather than drifting apart.

const T = {
  button: { en: 'Report', ne: 'रिपोर्ट' },
  title: { en: 'Send a ground report', ne: 'स्थलगत रिपोर्ट पठाउनुहोस्' },
  intro: {
    en: 'A photo from where you are, and a line about what it shows. It goes on the public map.',
    ne: 'तपाईं भएको ठाउँको तस्बिर र त्यसमा के छ भन्ने एक हरफ। यो सार्वजनिक नक्सामा देखिनेछ।',
  },
  choose: { en: 'Choose a photo', ne: 'तस्बिर छान्नुहोस्' },
  takePhoto: { en: 'Take a photo', ne: 'तस्बिर खिच्नुहोस्' },
  change: { en: 'Choose a different photo', ne: 'अर्को तस्बिर छान्नुहोस्' },
  description: { en: 'What does it show?', ne: 'यसमा के देखिन्छ?' },
  descriptionHint: {
    en: 'Where it was taken, and what is happening.',
    ne: 'कहाँ खिचिएको हो र के भइरहेको छ।',
  },
  name: { en: 'Your name (optional)', ne: 'तपाईंको नाम (ऐच्छिक)' },
  send: { en: 'Send report', ne: 'रिपोर्ट पठाउनुहोस्' },
  sending: { en: 'Sending…', ne: 'पठाउँदै…' },
  sent: { en: 'Thank you — your photo is on the map.', ne: 'धन्यवाद — तपाईंको तस्बिर नक्सामा छ।' },
  close: { en: 'Close', ne: 'बन्द' },
  needPhoto: { en: 'Choose a photo first.', ne: 'पहिले तस्बिर छान्नुहोस्।' },
  shutter: { en: 'Capture', ne: 'खिच्नुहोस्' },
  cancelCamera: { en: 'Cancel', ne: 'रद्द' },
  cameraDenied: {
    en: 'The camera is unavailable. Choose a photo from your device instead.',
    ne: 'क्यामेरा उपलब्ध छैन। बरु यन्त्रबाट तस्बिर छान्नुहोस्।',
  },
  tooBig: { en: 'That photo is too large. The limit is 12 MB.', ne: 'तस्बिर धेरै ठूलो छ। सीमा १२ एमबी हो।' },
  notImage: { en: 'That file is not an image.', ne: 'त्यो फाइल तस्बिर होइन।' },
  failed: { en: 'That did not send. Please try again.', ne: 'पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।' },
  off: {
    en: 'Photo reports are not switched on for this deployment.',
    ne: 'यो सर्भरमा तस्बिर रिपोर्ट सक्रिय गरिएको छैन।',
  },
  // Stated rather than ticked. It still has to be said — this lands on a public
  // map — but it reads as a rule of the desk, not a consent gate.
  safety: {
    en: 'Please don’t send photos of injured or dead people, or anyone’s private documents.',
    ne: 'कृपया घाइते वा मृत व्यक्ति, वा कसैका निजी कागजातका तस्बिर नपठाउनुहोस्।',
  },
};

const MAX_BYTES = 12 * 1024 * 1024;

export default function FloodReportButton({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [contributor, setContributor] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'sent' | 'failed' | 'off'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  /**
   * Open the live camera.
   *
   * getUserMedia gives a real viewfinder on both phone and laptop, which is
   * what "take a photo" should mean. Where it is unavailable — an insecure
   * origin, a locked-down browser, permission refused — this falls back to the
   * file input carrying capture="environment", which at least opens the camera
   * app on a phone.
   */
  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError(t('cameraDenied'));
      cameraRef.current?.click();
    }
  };

  // Attach the stream once the <video> is actually in the tree.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // Never leave the camera light on because a dialog closed.
  useEffect(() => stopCamera, []);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      setFile(new File([blob], `report-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setState('idle');
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  // Object URLs are revoked on replacement and on unmount; a long session of
  // picking photos should not pin every one of them in memory.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    stopCamera();
    setFile(null);
    setCaption('');
    setContributor('');
    setProgress(null);
    setState('idle');
    setError(null);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] || null;
    e.target.value = '';
    if (!chosen) return;
    if (!chosen.type.startsWith('image/')) { setError(t('notImage')); return; }
    if (chosen.size > MAX_BYTES) { setError(t('tooBig')); return; }
    setError(null);
    setState('idle');
    setFile(chosen);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError(t('needPhoto')); return; }
    if (progress != null) return;
    setError(null);

    const form = new FormData();
    form.set('photo', file);
    // The rule is stated above the button rather than ticked. The server still
    // requires this field, so sending a report is the acknowledgement.
    form.set('safetyAcknowledged', 'true');
    if (caption.trim()) form.set('caption', caption.trim());
    if (contributor.trim()) form.set('contributor', contributor.trim());

    // XHR rather than fetch: a photo over a mobile connection can take a minute
    // and the only thing worse than a slow upload is one with no progress bar.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/flood/photos');
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201 || xhr.status === 200) {
        setState('sent');
        setFile(null);
        setCaption('');
      } else if (xhr.status === 503) {
        setState('off');
      } else {
        setState('failed');
      }
    };
    xhr.onerror = () => { setProgress(null); setState('failed'); };
    xhr.send(form);
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-report-cta"
        size="sm"
      >
        <Camera className="h-4 w-4" />
        {t('button')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('intro')}</DialogDescription>
          </DialogHeader>

          {state === 'sent' ? (
            <div className="grid gap-4">
              <p className="m-0 text-sm text-[#1c7a4b]">{t('sent')}</p>
              <Button type="button" onClick={() => { setOpen(false); reset(); }}>
                {t('close')}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              {/* Two ways in. On a phone, capture="environment" opens the rear
                  camera directly; on a desktop it is an ordinary file picker,
                  so both are offered rather than guessing the device. */}
              <input
                ref={pickRef}
                type="file"
                accept="image/*"
                onChange={onPick}
                className="hidden"
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className="hidden"
              />

              {cameraOn ? (
                <div className="grid gap-3">
                  {/* A real viewfinder, not a file dialog. */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="max-h-64 w-full rounded-md border border-border bg-black object-contain"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" variant="outline" onClick={stopCamera}>
                      {t('cancelCamera')}
                    </Button>
                    <Button type="button" onClick={shoot}>
                      <Camera className="h-4 w-4" />
                      {t('shutter')}
                    </Button>
                  </div>
                </div>
              ) : preview ? (
                <div className="relative">
                  {/* The chosen file, straight from the browser — nothing is
                      uploaded until Send. */}
                  <img
                    src={preview}
                    alt=""
                    className="max-h-64 w-full rounded-md border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    aria-label={t('change')}
                    className="absolute right-2 top-2 rounded-full border border-border bg-background/90 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" onClick={openCamera}>
                    <Camera className="h-4 w-4" />
                    {t('takePhoto')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => pickRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" />
                    {t('choose')}
                  </Button>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="report-caption">{t('description')}</Label>
                <Textarea
                  id="report-caption"
                  rows={3}
                  maxLength={600}
                  placeholder={t('descriptionHint')}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="report-name">{t('name')}</Label>
                <Input
                  id="report-name"
                  maxLength={120}
                  value={contributor}
                  onChange={e => setContributor(e.target.value)}
                />
              </div>

              <p className="m-0 text-xs leading-snug text-muted-foreground">{t('safety')}</p>

              {progress != null && (
                <span className="fl-upload-bar"><i style={{ width: `${progress}%` }} /></span>
              )}
              {error && <p className="m-0 text-sm text-destructive">{error}</p>}
              {state === 'failed' && <p className="m-0 text-sm text-destructive">{t('failed')}</p>}
              {state === 'off' && <p className="m-0 text-sm text-destructive">{t('off')}</p>}

              <Button type="submit" disabled={!file || progress != null}>
                {progress != null ? t('sending') : t('send')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
