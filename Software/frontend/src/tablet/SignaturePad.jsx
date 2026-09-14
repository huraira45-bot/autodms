/**
 * Finger/stylus signature box for the service tablet (plan 2026-09-14,
 * Phase 2). No library: pointer events on a canvas.
 *
 * Strokes are kept as points relative to the box size, so turning the tablet
 * (which resizes the box) redraws the signature instead of distorting or
 * losing it.
 *
 * ref API: clear(), isEmpty(), toBlob() -> Promise<Blob> (PNG)
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

const SignaturePad = forwardRef(function SignaturePad({ height = 240, onChange }, ref) {
    const canvasRef = useRef(null);
    const strokes = useRef([]);      // [[{ x, y }]] with x, y in 0..1
    const current = useRef(null);

    const ctxFor = (canvas) => {
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
        return ctx;
    };

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = canvas.offsetWidth;
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = ctxFor(canvas);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        for (const stroke of strokes.current) {
            if (!stroke.length) continue;
            ctx.beginPath();
            ctx.moveTo(stroke[0].x * w, stroke[0].y * height);
            if (stroke.length === 1) ctx.lineTo(stroke[0].x * w + 0.1, stroke[0].y * height + 0.1);
            for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * w, stroke[i].y * height);
            ctx.stroke();
        }
    }, [height]);

    useEffect(() => {
        redraw();
        window.addEventListener('resize', redraw);
        return () => window.removeEventListener('resize', redraw);
    }, [redraw]);

    const point = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
        };
    };

    const down = (e) => {
        e.preventDefault();
        canvasRef.current.setPointerCapture?.(e.pointerId);
        current.current = [point(e)];
        strokes.current.push(current.current);
        redraw();
    };

    const move = (e) => {
        if (!current.current) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        const prev = current.current[current.current.length - 1];
        const p = point(e);
        current.current.push(p);
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const ctx = ctxFor(canvas);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.beginPath();
        ctx.moveTo(prev.x * canvas.offsetWidth, prev.y * height);
        ctx.lineTo(p.x * canvas.offsetWidth, p.y * height);
        ctx.stroke();
    };

    const up = () => {
        if (!current.current) return;
        current.current = null;
        onChange?.(strokes.current.length > 0);
    };

    useImperativeHandle(ref, () => ({
        clear: () => { strokes.current = []; current.current = null; redraw(); onChange?.(false); },
        isEmpty: () => strokes.current.length === 0,
        toBlob: () => new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png')),
    }), [redraw, onChange]);

    return (
        <div style={{ position: 'relative' }}>
            <canvas
                ref={canvasRef}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerLeave={up}
                style={{
                    width: '100%', height, display: 'block', touchAction: 'none', cursor: 'crosshair',
                    background: '#fff', border: '2px dashed #94a3b8', borderRadius: 10, boxSizing: 'border-box',
                }}
            />
            <div style={{
                position: 'absolute', left: 24, right: 24, bottom: 46, borderBottom: '1px solid #cbd5e1',
                pointerEvents: 'none',
            }} />
            <div style={{ position: 'absolute', left: 24, bottom: 20, fontSize: 13, color: '#94a3b8', pointerEvents: 'none' }}>
                Sign above the line
            </div>
        </div>
    );
});

export default SignaturePad;
