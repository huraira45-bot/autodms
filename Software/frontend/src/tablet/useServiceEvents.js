/**
 * Live updates for the service screens (plan 2026-09-14, Phase 3): the
 * socket.io namespace /service served by Software/services/serviceEvents.js.
 *
 *   const live = useServiceEvents(token, { 'bay:jobs-changed': reload });
 *
 * Events carry ids only; a handler reloads through the normal API. Screens
 * keep polling as well, so a dropped socket only makes them slower to update.
 * Returns whether the socket is currently connected.
 */
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { isNativeApp, getServerUrl } from './serverConfig';

export function useServiceEvents(token, handlers) {
    const [connected, setConnected] = useState(false);
    const latest = useRef(handlers);
    latest.current = handlers;
    const names = Object.keys(handlers || {}).sort().join('|');

    useEffect(() => {
        if (!token) return undefined;
        // Inside the Android app the page comes from the app bundle, so the
        // socket has to be pointed at the DealerDesk server explicitly.
        const base = isNativeApp() ? (getServerUrl() || '') : '';
        const socket = io(`${base}/service`, {
            path: '/socket.io',
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));
        for (const name of names.split('|').filter(Boolean)) {
            socket.on(name, (payload) => latest.current?.[name]?.(payload));
        }
        return () => {
            socket.disconnect();
            setConnected(false);
        };
    }, [token, names]);

    return connected;
}
