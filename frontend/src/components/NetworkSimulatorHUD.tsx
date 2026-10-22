import React from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Clock,
  FastForward,
  Gauge,
  Radio,
  ArrowDownCircle,
  ArrowUpCircle,
  ShieldAlert,
} from 'lucide-react';
import type { ChannelTier } from '../hooks/useAdaptiveChannel';

export interface NetworkSimulatorHUDProps {
  currentTier: ChannelTier;
  targetTier: ChannelTier;
  bitrateKbps: number;
  rttMs: number;
  packetLossPct: number;
  simulatedBandwidthKbps: number;
  setSimulatedBandwidthKbps: (kbps: number) => void;
  hysteresisCountdown: number;
  hysteresisDirection: 'UP' | 'DOWN' | null;
  onFastForward?: () => void;
  role?: 'spoke' | 'hub';
  isWsConnected?: boolean;
  isPeerConnected?: boolean;
  pendingOutboxCount?: number;
}

const PRESETS = [
  { label: 'Tier 1: 380 kbps', value: 380, tier: 1 as ChannelTier, desc: 'HD Video + Opus' },
  { label: 'Tier 2: 180 kbps', value: 180, tier: 2 as ChannelTier, desc: 'Low-Res Video' },
  { label: 'Tier 3: 45 kbps', value: 45, tier: 3 as ChannelTier, desc: 'Audio + Still Photo' },
  { label: 'Tier 4: 0 kbps Ghat Outage', value: 0, tier: 4 as ChannelTier, desc: 'Offline Store-and-Forward' },
];

export const NetworkSimulatorHUD: React.FC<NetworkSimulatorHUDProps> = ({
  currentTier,
  targetTier,
  bitrateKbps,
  rttMs,
  packetLossPct,
  simulatedBandwidthKbps,
  setSimulatedBandwidthKbps,
  hysteresisCountdown,
  hysteresisDirection,
  onFastForward,
  role = 'spoke',
  isWsConnected = false,
  isPeerConnected = false,
  pendingOutboxCount = 0,
}) => {
  const getTierBadge = (tier: ChannelTier) => {
    switch (tier) {
      case 1:
        return {
          bg: '#064e3b',
          border: '#059669',
          text: '#34d399',
          glow: 'rgba(16, 185, 129, 0.4)',
          label: 'Tier 1 (≥300 kbps)',
          sub: 'Live HD Video (640x480) + Opus Audio',
          dot: '#10b981',
        };
      case 2:
        return {
          bg: '#0c4a6e',
          border: '#0284c7',
          text: '#38bdf8',
          glow: 'rgba(14, 165, 233, 0.4)',
          label: 'Tier 2 (120–299 kbps)',
          sub: 'Low-Res Video (50% scale, 140 kbps cap)',
          dot: '#0ea5e9',
        };
      case 3:
        return {
          bg: '#78350f',
          border: '#d97706',
          text: '#fbbf24',
          glow: 'rgba(245, 158, 11, 0.4)',
          label: 'Tier 3 (30–119 kbps)',
          sub: 'Audio-Only + WebP Still Photos (0.5q, 320x240)',
          dot: '#f59e0b',
        };
      case 4:
        return {
          bg: '#7f1d1d',
          border: '#dc2626',
          text: '#f87171',
          glow: 'rgba(239, 68, 68, 0.4)',
          label: 'Tier 4 (<30 kbps)',
          sub: 'Offline Store & Forward (IndexedDB Outbox)',
          dot: '#ef4444',
        };
    }
  };

  const badge = getTierBadge(currentTier);

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#090d16',
        borderBottom: '1px solid #1e293b',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
        color: '#f1f5f9',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Banner: Status & Real-time Telemetry Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          gap: '12px',
          borderBottom: '1px solid #151f32',
        }}
      >
        {/* Left: Role Badge & Current Tier Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: role === 'spoke' ? '#1e1b4b' : '#142d42',
              color: role === 'spoke' ? '#a5b4fc' : '#7dd3fc',
              border: `1px solid ${role === 'spoke' ? '#4338ca' : '#0369a1'}`,
            }}
          >
            {role === 'spoke' ? 'SPOKE (PHC)' : 'HUB (SPECIALIST)'}
          </span>

          {/* Glowing Tier Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              borderRadius: '9999px',
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`,
              boxShadow: `0 0 12px ${badge.glow}`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: badge.dot,
                boxShadow: `0 0 6px ${badge.dot}`,
                display: 'inline-block',
                animation: 'pulse 1.8s infinite ease-in-out',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 700, color: badge.text }}>
              {badge.label}
            </span>
          </div>

          <span
            style={{
              fontSize: '12px',
              color: '#94a3b8',
              display: 'none',
              maxWidth: '320px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            className="hud-sub-label"
          >
            {badge.sub}
          </span>
        </div>

        {/* Center: Live Telemetry Metrics */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backgroundColor: '#0f172a',
            padding: '4px 14px',
            borderRadius: '8px',
            border: '1px solid #1e293b',
          }}
        >
          {/* Bitrate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Gauge size={14} color="#38bdf8" />
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Bitrate:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
              {bitrateKbps}
            </span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>kbps</span>
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: '#334155' }} />

          {/* RTT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} color={rttMs > 250 ? '#f87171' : rttMs > 100 ? '#fbbf24' : '#34d399'} />
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>RTT:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
              {rttMs}
            </span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>ms</span>
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: '#334155' }} />

          {/* Packet Loss */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={14} color={packetLossPct > 5 ? '#f87171' : '#38bdf8'} />
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Loss:</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
              {packetLossPct}%
            </span>
          </div>
        </div>

        {/* Right: Connection Status & Outbox Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {pendingOutboxCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: '#7f1d1d',
                color: '#fca5a5',
                border: '1px solid #ef4444',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title="Store-and-Forward payloads cached in IndexedDB"
            >
              <ShieldAlert size={12} />
              {pendingOutboxCount} Outbox Items
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
            {isWsConnected ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                <Wifi size={13} /> Signalling
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
                <WifiOff size={13} /> Offline
              </span>
            )}
            <span style={{ color: '#475569' }}>•</span>
            <span style={{ color: isPeerConnected ? '#38bdf8' : '#64748b' }}>
              {isPeerConnected ? 'Peer Live' : 'Waiting for Peer'}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Banner: Hysteresis Countdown & Fast Forward Trigger */}
      {hysteresisDirection && hysteresisCountdown > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            backgroundColor: hysteresisDirection === 'DOWN' ? '#3b1219' : '#0c2d48',
            borderBottom: `1px solid ${hysteresisDirection === 'DOWN' ? '#831843' : '#075985'}`,
            color: '#f1f5f9',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hysteresisDirection === 'DOWN' ? (
              <ArrowDownCircle size={16} color="#f43f5e" />
            ) : (
              <ArrowUpCircle size={16} color="#38bdf8" />
            )}
            <span>
              <strong>Hysteresis Active:</strong>{' '}
              {hysteresisDirection === 'DOWN'
                ? `Network drop detected. Stepping down to Tier ${targetTier} in ${hysteresisCountdown}s...`
                : `Bandwidth stabilized above threshold. Stepping up to Tier ${targetTier} in ${hysteresisCountdown}s...`}
            </span>
          </div>

          {onFastForward && (
            <button
              onClick={onFastForward}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: hysteresisDirection === 'DOWN' ? '#e11d48' : '#0284c7',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '11px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                transition: 'background-color 0.2s',
              }}
              title="Skip remaining hysteresis timer for instant evaluation"
            >
              <FastForward size={13} />
              Fast Forward Timer (Skip {hysteresisCountdown}s)
            </button>
          )}
        </div>
      )}

      {/* Bottom Control Bar: Presets & Continuous Bandwidth Slider */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#0c101d',
          gap: '12px',
        }}
      >
        {/* Preset Buttons for Live Judge Demonstrations */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Judge Presets:
          </span>
          {PRESETS.map((preset) => {
            const isSelected = simulatedBandwidthKbps === preset.value;
            const tierColor =
              preset.tier === 1
                ? '#10b981'
                : preset.tier === 2
                ? '#0ea5e9'
                : preset.tier === 3
                ? '#f59e0b'
                : '#ef4444';

            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSimulatedBandwidthKbps(preset.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                  color: isSelected ? '#ffffff' : '#cbd5e1',
                  border: isSelected ? `2px solid ${tierColor}` : '1px solid #334155',
                  boxShadow: isSelected ? `0 0 8px ${tierColor}40` : 'none',
                  transition: 'all 0.15s ease-in-out',
                }}
                title={preset.desc}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Continuous Bandwidth Slider (0 to 500 kbps) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: '1 1 280px',
            maxWidth: '450px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '100px' }}>
            <Clock size={12} color="#64748b" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Throttle:</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#38bdf8',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {simulatedBandwidthKbps} kbps
            </span>
          </div>

          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              type="range"
              min="0"
              max="500"
              step="5"
              value={simulatedBandwidthKbps}
              onChange={(e) => setSimulatedBandwidthKbps(Number(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                cursor: 'pointer',
                accentColor:
                  simulatedBandwidthKbps >= 300
                    ? '#10b981'
                    : simulatedBandwidthKbps >= 120
                    ? '#0ea5e9'
                    : simulatedBandwidthKbps >= 30
                    ? '#f59e0b'
                    : '#ef4444',
              }}
            />
          </div>

          <span style={{ fontSize: '10px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            500k
          </span>
        </div>
      </div>
    </div>
  );
};
