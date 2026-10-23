import { useState } from 'react';
import {
  Siren,
  Hospital,
  Activity,
  Layers,
  Navigation,
  AlertTriangle,
  Play,
} from 'lucide-react';

interface HealthcareNode {
  id: string;
  name: string;
  kannadaName: string;
  type: 'spoke' | 'hub' | 'fru';
  taluka: string;
  district: string;
  x: number; // SVG viewBox coordinates (0 to 1000)
  y: number; // SVG viewBox coordinates (0 to 700)
  elevation: string;
  terrain: string;
  tier: 1 | 2 | 3 | 4;
  bandwidthKbps: number;
  unservedPopulation: string;
  activeCases: number;
  hasRedFlag: boolean;
  nearestFruId: string;
  connectedHubId: string;
  notes: string;
}

const HEALTHCARE_NODES: HealthcareNode[] = [
  // Specialist Hubs
  {
    id: 'hub-mangaluru',
    name: 'Wenlock District Hospital Hub',
    kannadaName: 'ವೆನ್ಲಾಕ್ ಜಿಲ್ಲಾ ಆಸ್ಪತ್ರೆ ಹಬ್ (ಮಂಗಳೂರು)',
    type: 'hub',
    taluka: 'Mangaluru',
    district: 'Dakshina Kannada',
    x: 320,
    y: 390,
    elevation: '22m Coastal',
    terrain: 'Tertiary Medical College Hub',
    tier: 1,
    bandwidthKbps: 850,
    unservedPopulation: 'N/A (Metropolitan)',
    activeCases: 14,
    hasRedFlag: true,
    nearestFruId: 'hub-mangaluru',
    connectedHubId: 'hub-mangaluru',
    notes: 'District Telemedicine Command Centre with 24/7 Cardiology ICU & Antivenom Depot',
  },
  {
    id: 'hub-udupi',
    name: 'Udupi District Hospital Hub',
    kannadaName: 'ಉಡುಪಿ ಜಿಲ್ಲಾ ಆಸ್ಪತ್ರೆ ಹಬ್',
    type: 'hub',
    taluka: 'Udupi',
    district: 'Udupi',
    x: 230,
    y: 220,
    elevation: '18m Coastal',
    terrain: 'District Specialist Center',
    tier: 1,
    bandwidthKbps: 720,
    unservedPopulation: 'N/A',
    activeCases: 8,
    hasRedFlag: false,
    nearestFruId: 'hub-udupi',
    connectedHubId: 'hub-udupi',
    notes: 'Secondary Specialist Hub covering Western Ghat foothill talukas',
  },

  // First Referral Unit (FRU)
  {
    id: 'fru-puttur',
    name: 'Puttur Sub-Divisional Hospital (FRU)',
    kannadaName: 'ಪುತ್ತೂರು ಉಪವಿಭಾಗೀಯ ಆಸ್ಪತ್ರೆ (FRU)',
    type: 'fru',
    taluka: 'Puttur',
    district: 'Dakshina Kannada',
    x: 520,
    y: 430,
    elevation: '85m Valley',
    terrain: 'First Referral Unit (Emergency Stabilization)',
    tier: 2,
    bandwidthKbps: 220,
    unservedPopulation: '18,500',
    activeCases: 5,
    hasRedFlag: false,
    nearestFruId: 'fru-puttur',
    connectedHubId: 'hub-mangaluru',
    notes: 'First Referral Unit equipped with polyvalent anti-snake venom and emergency resuscitation',
  },

  // Rural Spokes (PHCs)
  {
    id: 'spoke-sullia',
    name: 'Sullia PHC Sub-Centre',
    kannadaName: 'ಸುಳ್ಯ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ',
    type: 'spoke',
    taluka: 'Sullia',
    district: 'Dakshina Kannada',
    x: 740,
    y: 530,
    elevation: '142m Ghat Valley',
    terrain: 'Ghat Edge / Dense Canopy Valley',
    tier: 3,
    bandwidthKbps: 45,
    unservedPopulation: '28,400',
    activeCases: 3,
    hasRedFlag: true, // Ramesh Gowda
    nearestFruId: 'fru-puttur',
    connectedHubId: 'hub-mangaluru',
    notes: 'Prone to total cellular dropouts during Ghat monsoons & forest valley transit',
  },
  {
    id: 'spoke-beltangady',
    name: 'Beltangady Charmadi PHC',
    kannadaName: 'ಬೆಳ್ತಂಗಡಿ ಚಾರ್ಮಾಡಿ ಉಪಕೇಂದ್ರ',
    type: 'spoke',
    taluka: 'Beltangady',
    district: 'Dakshina Kannada',
    x: 620,
    y: 310,
    elevation: '110m Foothills',
    terrain: 'Charmadi Ghat Escarpment',
    tier: 2,
    bandwidthKbps: 180,
    unservedPopulation: '32,100',
    activeCases: 2,
    hasRedFlag: false,
    nearestFruId: 'fru-puttur',
    connectedHubId: 'hub-mangaluru',
    notes: 'Unstable 3G link with frequent packet loss spikes (35% loss)',
  },
  {
    id: 'spoke-karkala',
    name: 'Karkala Ghat PHC',
    kannadaName: 'ಕಾರ್ಕಳ ಘಾಟಿ ಪ್ರಾಥಮಿಕ ಕೇಂದ್ರ',
    type: 'spoke',
    taluka: 'Karkala',
    district: 'Udupi',
    x: 440,
    y: 190,
    elevation: '98m Foothill Ridge',
    terrain: 'Kudremukh Foothill Boundary',
    tier: 1,
    bandwidthKbps: 340,
    unservedPopulation: '14,200',
    activeCases: 1,
    hasRedFlag: false,
    nearestFruId: 'hub-udupi',
    connectedHubId: 'hub-udupi',
    notes: 'Manjula Nayak case registered; stable Tier 1 link with occasional flap',
  },
  {
    id: 'spoke-bhatkal',
    name: 'Bhatkal Coastal Sub-Centre',
    kannadaName: 'ಭಟ್ಕಳ ಕರಾವಳಿ ಉಪಕೇಂದ್ರ',
    type: 'spoke',
    taluka: 'Bhatkal',
    district: 'Uttara Kannada',
    x: 140,
    y: 80,
    elevation: '12m Coastal Edge',
    terrain: 'Coastal Fishing Hamlet',
    tier: 4,
    bandwidthKbps: 0,
    unservedPopulation: '19,800',
    activeCases: 1,
    hasRedFlag: false,
    nearestFruId: 'hub-udupi',
    connectedHubId: 'hub-udupi',
    notes: 'Currently in Tier 4 Offline Outbox Mode due to optic fiber severance in Ghat',
  },
];

interface TalukaUmapViewProps {
  onSelectSpoke?: (spokeNode: HealthcareNode) => void;
  onSimulateCall?: (caseId: string) => void;
  lang?: 'en' | 'kn';
}

export function TalukaUmapView({ onSelectSpoke, onSimulateCall, lang = 'en' }: TalukaUmapViewProps) {
  const [selectedNode, setSelectedNode] = useState<HealthcareNode>(HEALTHCARE_NODES[3]); // Sullia default
  const [showLiveMapEmbed, setShowLiveMapEmbed] = useState<boolean>(false);
  const [customUmapUrl, setCustomUmapUrl] = useState<string>(
    'https://www.openstreetmap.org/export/embed.html?bbox=74.45,12.35,75.75,13.75&layer=mapnik&marker=12.87,75.15'
  );
  const [ambulanceDispatched, setAmbulanceDispatched] = useState<boolean>(true);
  const [tierOverride, setTierOverride] = useState<Record<string, number>>({});

  const isKn = lang === 'kn';

  const getNodeTier = (node: HealthcareNode): number => {
    return tierOverride[node.id] !== undefined ? tierOverride[node.id] : node.tier;
  };

  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 1:
        return '#10b981'; // emerald
      case 2:
        return '#38bdf8'; // sky
      case 3:
        return '#f59e0b'; // amber
      case 4:
        return '#ef4444'; // rose red
      default:
        return '#94a3b8';
    }
  };

  const getTierBadge = (tier: number) => {
    switch (tier) {
      case 1:
        return { label: 'Tier 1 (4G HD)', bg: '#064e3b', text: '#34d399', border: '#059669' };
      case 2:
        return { label: 'Tier 2 (3G Downscale)', bg: '#0c4a6e', text: '#7dd3fc', border: '#0284c7' };
      case 3:
        return { label: 'Tier 3 (2G Voice+WebP)', bg: '#451a03', text: '#fcd34d', border: '#d97706' };
      case 4:
        return { label: 'Tier 4 (Offline Outbox)', bg: '#450a0a', text: '#fca5a5', border: '#dc2626' };
      default:
        return { label: 'Unknown', bg: '#1e293b', text: '#94a3b8', border: '#334155' };
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 75px)',
        backgroundColor: '#070a13',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner Toolbar */}
      <div
        style={{
          padding: '12px 24px',
          backgroundColor: '#0b1120',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
              border: '1px solid #3b82f6',
            }}
          >
            <Navigation size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                {isKn
                  ? 'ಕರಾವಳಿ ಮತ್ತು ಪಶ್ಚಿಮ ಘಟ್ಟ ತಾಲೂಕು ಟೆಲಿಮೆಡಿಸಿನ್ ನಕ್ಷೆ (uMap)'
                  : 'Coastal & Western Ghat Taluka Telemedicine uMap'}
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#14532d',
                  color: '#86efac',
                  border: '1px solid #16a34a',
                }}
              >
                Zero-API-Key Vector & OSM
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {isKn
                ? 'ಸುಳ್ಯ, ಬೆಳ್ತಂಗಡಿ, ಕಾರ್ಕಳ ಪ್ರಾಥಮಿಕ ಕೇಂದ್ರಗಳಿಂದ ಮಂಗಳೂರು-ಉಡುಪಿ ಜಿಲ್ಲಾ ಆಸ್ಪತ್ರೆಗಳ ನೆಟ್‌ವರ್ಕ್ ಸಂಪರ್ಕ'
                : 'Live network tiers, Ghat terrain topography, and 108 FRU ambulance emergency dispatch corridors'}
            </p>
          </div>
        </div>

        {/* View mode toggle button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setAmbulanceDispatched(!ambulanceDispatched)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: ambulanceDispatched ? '#450a0a' : '#1e293b',
              color: ambulanceDispatched ? '#fca5a5' : '#cbd5e1',
              border: `1px solid ${ambulanceDispatched ? '#dc2626' : '#334155'}`,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Siren size={15} color={ambulanceDispatched ? '#f87171' : '#94a3b8'} />
            {ambulanceDispatched
              ? isKn
                ? '108 ಆಂಬ್ಯುಲೆನ್ಸ್ ಚಾಲನೆಯಲ್ಲಿದೆ'
                : '108 FRU Ambulance Active'
              : isKn
              ? '108 ಆಂಬ್ಯುಲೆನ್ಸ್ ಸಕ್ರಿಯಗೊಳಿಸಿ'
              : 'Trigger 108 FRU Corridor'}
          </button>

          <button
            type="button"
            onClick={() => setShowLiveMapEmbed(!showLiveMapEmbed)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: showLiveMapEmbed ? '#2563eb' : '#1e293b',
              color: showLiveMapEmbed ? '#ffffff' : '#cbd5e1',
              border: `1px solid ${showLiveMapEmbed ? '#3b82f6' : '#334155'}`,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={14} />
            {showLiveMapEmbed
              ? isKn
                ? 'ವೆಕ್ಟರ್ ಟೋಪೋಗ್ರಫಿಗೆ ಬದಲಾಯಿಸಿ'
                : 'Switch to Vector Topography'
              : isKn
              ? 'ಲೈವ್ OpenStreetMap / uMap ಪದರ'
              : 'Switch to Live OpenStreetMap'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: '1 1 auto', overflow: 'hidden' }}>
        {/* Left Side: Map Visualizer (SVG or OSM Embed) */}
        <div
          style={{
            flex: '1 1 70%',
            position: 'relative',
            backgroundColor: '#050814',
            overflow: 'hidden',
          }}
        >
          {showLiveMapEmbed ? (
            /* OpenStreetMap / uMap Iframe Embed */
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0f172a',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                }}
              >
                <span style={{ color: '#94a3b8' }}>Custom uMap / OSM Embed URL:</span>
                <input
                  type="text"
                  value={customUmapUrl}
                  onChange={(e) => setCustomUmapUrl(e.target.value)}
                  style={{
                    flex: '1 1 auto',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    fontSize: '11px',
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setCustomUmapUrl(
                      'https://www.openstreetmap.org/export/embed.html?bbox=74.45,12.35,75.75,13.75&layer=mapnik&marker=12.87,75.15'
                    )
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
              <iframe
                title="Dakshina Kannada uMap"
                src={customUmapUrl}
                style={{
                  width: '100%',
                  flex: '1 1 auto',
                  border: 'none',
                  filter: 'invert(90%) hue-rotate(180deg) brightness(85%) contrast(110%)',
                }}
              />
            </div>
          ) : (
            /* Interactive Zero-API-Key SVG Topographic Map */
            <svg
              viewBox="0 0 1000 680"
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                background: 'radial-gradient(ellipse at 70% 50%, #0d1e38 0%, #050814 85%)',
                userSelect: 'none',
              }}
            >
              <defs>
                {/* Terrain Gradients */}
                <linearGradient id="ghatGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient id="arabianSea" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0369a1" stopOpacity="0.05" />
                </linearGradient>

                {/* Pulsing Signal Filters */}
                <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glowRed" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Arabian Sea Coastline Backdrop */}
              <path
                d="M 0,0 L 160,0 L 220,180 L 290,360 L 330,550 L 350,680 L 0,680 Z"
                fill="url(#arabianSea)"
              />
              <text x="30" y="340" fill="#38bdf8" fontSize="13" fontWeight="700" opacity="0.4" letterSpacing="6">
                ARABIAN SEA (ಕರಾವಳಿ)
              </text>

              {/* Western Ghats Mountain Ridge Silhouette (Shaded Relief) */}
              <path
                d="M 450,0 Q 560,180 620,320 T 780,560 L 1000,680 L 1000,0 Z"
                fill="url(#ghatGlow)"
              />
              <path
                d="M 520,30 Q 640,190 690,320 T 850,560"
                fill="none"
                stroke="#1e293b"
                strokeWidth="24"
                opacity="0.5"
                strokeLinecap="round"
              />
              <text x="760" y="160" fill="#64748b" fontSize="14" fontWeight="800" opacity="0.35" letterSpacing="4">
                WESTERN GHATS ESCARPMENT (ಪಶ್ಚಿಮ ಘಟ್ಟ)
              </text>
              <text x="760" y="180" fill="#64748b" fontSize="10" fontWeight="600" opacity="0.3">
                Dense Canopy • Valley Multipath Fading • 2G Edge Zone
              </text>

              {/* Highway Corridor: Sullia -> Puttur -> Mangaluru (National Highway 275) */}
              <path
                id="ghatHighway"
                d="M 740,530 Q 630,480 520,430 Q 420,410 320,390"
                fill="none"
                stroke="#334155"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 740,530 Q 630,480 520,430 Q 420,410 320,390"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1.5"
                strokeDasharray="6,6"
                opacity="0.6"
              />
              <text x="540" y="485" fill="#94a3b8" fontSize="10" fontWeight="600">
                NH-275 Ghat Ambulance Transit (Sullia → Puttur FRU → Wenlock Hub)
              </text>

              {/* Highway Corridor: Beltangady -> Mangaluru */}
              <path
                d="M 620,310 Q 470,350 320,390"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeDasharray="4,4"
              />

              {/* Highway Corridor: Karkala -> Udupi */}
              <path
                d="M 440,190 Q 330,205 230,220"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeDasharray="4,4"
              />

              {/* Highway Corridor: Bhatkal -> Udupi (NH-66 Coastal) */}
              <path
                d="M 140,80 Q 185,150 230,220"
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                strokeDasharray="4,4"
              />

              {/* Inter-Hub Link: Udupi -> Mangaluru */}
              <path
                d="M 230,220 Q 275,305 320,390"
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                opacity="0.8"
                filter="url(#glowGreen)"
              />

              {/* Dynamic TeleThread Mesh Links (Spoke -> Hub) */}
              {HEALTHCARE_NODES.filter((n) => n.type === 'spoke').map((spoke) => {
                const hub = HEALTHCARE_NODES.find((n) => n.id === spoke.connectedHubId) || HEALTHCARE_NODES[0];
                const tier = getNodeTier(spoke);
                const color = getTierColor(tier);
                const isOffline = tier === 4;

                return (
                  <g key={`link-${spoke.id}`}>
                    <line
                      x1={spoke.x}
                      y1={spoke.y}
                      x2={hub.x}
                      y2={hub.y}
                      stroke={color}
                      strokeWidth={isOffline ? 1.5 : 2.5}
                      strokeDasharray={isOffline ? '4,8' : tier === 3 ? '6,6' : 'none'}
                      opacity={isOffline ? 0.4 : 0.8}
                    />

                    {/* Animated packets moving along the link if not offline */}
                    {!isOffline && (
                      <circle r="4" fill={color}>
                        <animateMotion
                          path={`M ${spoke.x},${spoke.y} L ${hub.x},${hub.y}`}
                          dur={tier === 1 ? '1.8s' : tier === 2 ? '3.2s' : '5.5s'}
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Animated 108 Emergency Ambulance running along NH-275 */}
              {ambulanceDispatched && (
                <g>
                  {/* Vehicle Marker */}
                  <g>
                    <animateMotion
                      path="M 740,530 Q 630,480 520,430 Q 420,410 320,390"
                      dur="9s"
                      repeatCount="indefinite"
                    />
                    <circle r="12" fill="#ef4444" opacity="0.3" filter="url(#glowRed)">
                      <animate attributeName="r" values="8;18;8" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <rect x="-9" y="-6" width="18" height="12" rx="3" fill="#ffffff" stroke="#ef4444" strokeWidth="2" />
                    <text x="0" y="3" textAnchor="middle" fontSize="7" fontWeight="900" fill="#ef4444">
                      108
                    </text>
                  </g>
                </g>
              )}

              {/* Render Healthcare Nodes */}
              {HEALTHCARE_NODES.map((node) => {
                const isSelected = selectedNode.id === node.id;
                const tier = getNodeTier(node);
                const tierColor = getTierColor(tier);

                return (
                  <g
                    key={node.id}
                    onClick={() => {
                      setSelectedNode(node);
                      if (onSelectSpoke) onSelectSpoke(node);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Pulsing Selection Halo */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="32"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="4,4"
                      >
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from={`0 ${node.x} ${node.y}`}
                          to={`360 ${node.x} ${node.y}`}
                          dur="12s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Red-Flag Urgent Case Alert Beacon */}
                    {node.hasRedFlag && (
                      <circle cx={node.x} cy={node.y} r="26" fill="none" stroke="#ef4444" strokeWidth="2.5">
                        <animate attributeName="r" values="18;34;18" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Node Core Body */}
                    {node.type === 'hub' ? (
                      /* Specialist Hub Icon */
                      <g>
                        <circle cx={node.x} cy={node.y} r="20" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="3" />
                        <Hospital x={node.x - 10} y={node.y - 10} size={20} color="#ffffff" />
                      </g>
                    ) : node.type === 'fru' ? (
                      /* First Referral Unit Icon */
                      <g>
                        <circle cx={node.x} cy={node.y} r="16" fill="#065f46" stroke="#34d399" strokeWidth="2.5" />
                        <Activity x={node.x - 8} y={node.y - 8} size={16} color="#ffffff" />
                      </g>
                    ) : (
                      /* Rural Spoke PHC */
                      <g>
                        <circle cx={node.x} cy={node.y} r="14" fill="#0f172a" stroke={tierColor} strokeWidth="3" />
                        <circle cx={node.x} cy={node.y} r="6" fill={tierColor} />
                      </g>
                    )}

                    {/* Node Text Label */}
                    <text
                      x={node.x}
                      y={node.y + (node.type === 'hub' ? 32 : 26)}
                      textAnchor="middle"
                      fill={isSelected ? '#38bdf8' : '#ffffff'}
                      fontSize={node.type === 'hub' ? 12 : 11}
                      fontWeight={isSelected ? 800 : 700}
                      filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.9))"
                    >
                      {isKn ? node.kannadaName.split(' ')[0] : node.name.split(' ')[0]}
                    </text>

                    {/* Bandwidth / Tier Pill */}
                    <rect
                      x={node.x - 28}
                      y={node.y - 28}
                      width="56"
                      height="14"
                      rx="7"
                      fill="#0b1120"
                      stroke={tierColor}
                      strokeWidth="1"
                    />
                    <text
                      x={node.x}
                      y={node.y - 18}
                      textAnchor="middle"
                      fill={tierColor}
                      fontSize="9"
                      fontWeight="800"
                    >
                      T{tier} • {node.bandwidthKbps}k
                    </text>
                  </g>
                );
              })}

              {/* Map Legend */}
              <g transform="translate(20, 520)">
                <rect x="0" y="0" width="220" height="140" rx="10" fill="#0a0f1d" opacity="0.9" stroke="#1e293b" />
                <text x="14" y="22" fill="#ffffff" fontSize="11" fontWeight="800">
                  NETWORK TOPOLOGY KEY
                </text>

                <circle cx="20" cy="42" r="5" fill="#10b981" />
                <text x="32" y="45" fill="#94a3b8" fontSize="10">
                  Tier 1 (≥300 kbps HD WebRTC)
                </text>

                <circle cx="20" cy="62" r="5" fill="#38bdf8" />
                <text x="32" y="65" fill="#94a3b8" fontSize="10">
                  Tier 2 (120–300 kbps 360p Downscaled)
                </text>

                <circle cx="20" cy="82" r="5" fill="#f59e0b" />
                <text x="32" y="85" fill="#94a3b8" fontSize="10">
                  Tier 3 (30–120 kbps Opus + WebP Still)
                </text>

                <circle cx="20" cy="102" r="5" fill="#ef4444" />
                <text x="32" y="105" fill="#94a3b8" fontSize="10">
                  Tier 4 (&lt;30 kbps Offline Outbox Sync)
                </text>

                <line x1="14" y1="124" x2="30" y2="124" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3,3" />
                <text x="36" y="127" fill="#cbd5e1" fontSize="10">
                  NH-275 Ghat FRU Transfer Corridor
                </text>
              </g>
            </svg>
          )}
        </div>

        {/* Right Side: Selected Node Telemetry & Action Drawer */}
        <div
          style={{
            flex: '1 1 30%',
            maxWidth: '440px',
            backgroundColor: '#0a0f1d',
            borderLeft: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '20px',
            gap: '16px',
          }}
        >
          {/* Node Identity Card */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#0f172a',
              border: `1px solid ${selectedNode.hasRedFlag ? '#dc2626' : '#1e293b'}`,
              boxShadow: selectedNode.hasRedFlag ? '0 0 20px rgba(220, 38, 38, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: selectedNode.type === 'hub' ? '#1e3a8a' : selectedNode.type === 'fru' ? '#065f46' : '#334155',
                    color: selectedNode.type === 'hub' ? '#93c5fd' : selectedNode.type === 'fru' ? '#6ee7b7' : '#cbd5e1',
                  }}
                >
                  {selectedNode.type === 'hub'
                    ? 'Specialist Hub'
                    : selectedNode.type === 'fru'
                    ? 'First Referral Unit (FRU)'
                    : 'Rural Spoke PHC'}
                </span>
                <h3 style={{ margin: '6px 0 2px 0', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  {isKn ? selectedNode.kannadaName : selectedNode.name}
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {selectedNode.taluka} Taluk, {selectedNode.district} District
                </div>
              </div>

              {selectedNode.hasRedFlag && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#450a0a',
                    color: '#f87171',
                    fontSize: '11px',
                    fontWeight: 800,
                    border: '1px solid #dc2626',
                  }}
                >
                  <AlertTriangle size={13} />
                  RED FLAG
                </span>
              )}
            </div>

            {/* Bandwidth & Tier Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#070a13',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Current Bandwidth</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: getTierColor(getNodeTier(selectedNode)) }}>
                  {selectedNode.bandwidthKbps} kbps
                </div>
              </div>

              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Zero-Restart Mode</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: getTierBadge(getNodeTier(selectedNode)).text }}>
                  {getTierBadge(getNodeTier(selectedNode)).label}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Terrain Profile</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                  {selectedNode.elevation}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Unserved 4G Pop.</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                  {selectedNode.unservedPopulation}
                </div>
              </div>
            </div>

            {/* Geographical Context & Notes */}
            <div
              style={{
                marginTop: '12px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.5,
                borderLeft: '3px solid #3b82f6',
                paddingLeft: '10px',
              }}
            >
              {selectedNode.notes}
            </div>
          </div>

          {/* Quick Network Degradation Simulation for This Node */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              {isKn ? 'ಈ ಕೇಂದ್ರದ ನೆಟ್‌ವರ್ಕ್ ಸ್ಥಿತಿ ಸಿಮ್ಯುಲೇಶನ್' : 'Simulate Ghat Link for this PHC'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[1, 2, 3, 4].map((tierNum) => {
                const isActive = getNodeTier(selectedNode) === tierNum;
                const badge = getTierBadge(tierNum);
                return (
                  <button
                    key={tierNum}
                    type="button"
                    onClick={() => setTierOverride({ ...tierOverride, [selectedNode.id]: tierNum })}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '6px',
                      backgroundColor: isActive ? badge.bg : '#1e293b',
                      color: isActive ? badge.text : '#94a3b8',
                      border: `1px solid ${isActive ? badge.border : '#334155'}`,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: isActive ? 800 : 500,
                      textAlign: 'center',
                    }}
                  >
                    T{tierNum}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
              Changes live mesh link animation speed and color on map
            </div>
          </div>

          {/* Connected Hub & Referral Routing Card */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              {isKn ? 'ತುರ್ತು ರೆಫರಲ್ ಮತ್ತು ಹಬ್ ರೂಟಿಂಗ್' : 'Emergency Referral & Hub Routing'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Designated Specialist Hub:</span>
                <span style={{ fontWeight: 600, color: '#60a5fa' }}>Wenlock District Hospital Hub</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Nearest First Referral Unit:</span>
                <span style={{ fontWeight: 600, color: '#34d399' }}>Puttur FRU (32 km / 45 min)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>108 ALS Ambulance Status:</span>
                <span style={{ fontWeight: 700, color: '#f87171' }}>
                  {ambulanceDispatched ? 'En route via NH-275' : 'Standby at Sullia Base'}
                </span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                if (onSimulateCall) {
                  onSimulateCall(selectedNode.id === 'spoke-sullia' ? 'TT-101' : 'TT-102');
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Play size={16} />
              {isKn
                ? `ಈ ಕೇಂದ್ರದಿಂದ ಸಮಾಲೋಚನೆ ಪ್ರಾರಂಭಿಸಿ (${selectedNode.name.split(' ')[0]})`
                : `Simulate Live Call from ${selectedNode.name.split(' ')[0]}`}
            </button>

            <button
              type="button"
              onClick={() => setAmbulanceDispatched(true)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Siren size={14} color="#f87171" />
              {isKn ? '108 ಎಫ್‌ಆರ್‌ಯು ಆಂಬ್ಯುಲೆನ್ಸ್ ಕಾರಿಡಾರ್ ಪರೀಕ್ಷಿಸಿ' : 'Test 108 FRU Dispatch Corridor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
