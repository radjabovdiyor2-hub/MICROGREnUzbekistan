import { TonConnectUIProvider, TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
// framer-motion removed — using CSS animations
import { Wallet, Coins, ArrowUpRight, Gift } from 'lucide-react';

// TON Connect manifest URL (host this on your domain)
const MANIFEST_URL = 'https://microgreenuzbekistan.com/tonconnect-manifest.json';

interface WalletPanelProps {
    ecoPoints: number;
    onClaim: () => void;
}

function WalletContent({ ecoPoints, onClaim }: WalletPanelProps) {
    const address = useTonAddress();
    const [_tonConnectUI] = useTonConnectUI();

    // Conversion rate: 1000 EcoPoints = 0.001 TON (for demo)
    const tonValue = (ecoPoints / 1000000).toFixed(4);
    const canClaim = ecoPoints >= 10000;

    const handleClaimReward = async () => {
        if (!address || !canClaim) return;

        try {
            // In production, this would call your backend to verify and send TON
            const response = await fetch('/api/claim-reward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    ecoPoints,
                }),
            });

            const result = await response.json();

            if (result.success) {
                onClaim();
                alert(`🎉 Отправлено ${result.amount} TON на ваш кошелёк!`);
            }
        } catch (error) {
            console.error('Claim error:', error);
        }
    };

    return (
        <div className="wallet-panel glass p-4 rounded-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Wallet className="text-blue-400" size={20} />
                    <span className="font-bold">TON Кошелёк</span>
                </div>
                <TonConnectButton />
            </div>

            {address ? (
                <>
                    {/* Connected State */}
                    <div className="bg-neutral-900/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-neutral-400 text-sm">Адрес:</span>
                            <span className="font-mono text-xs">
                                {address.slice(0, 6)}...{address.slice(-4)}
                            </span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-neutral-400 text-sm">EcoPoints:</span>
                            <span className="text-neon-green font-bold">{ecoPoints.toLocaleString()}</span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-neutral-400 text-sm">≈ TON:</span>
                            <span className="text-blue-400 font-mono">{tonValue}</span>
                        </div>
                    </div>

                    {/* Claim Button */}
                    <button
                        onClick={handleClaimReward}
                        disabled={!canClaim}
                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 tap-pressable ${canClaim
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                            : 'bg-neutral-800 text-neutral-500'
                            }`}
                    >
                        <Gift size={18} />
                        {canClaim ? 'Забрать награду' : `Нужно ${(10000 - ecoPoints).toLocaleString()} очков`}
                    </button>

                    <p className="text-xs text-neutral-500 text-center">
                        Минимум 10,000 EcoPoints для вывода
                    </p>
                </>
            ) : (
                <>
                    {/* Not Connected State */}
                    <div className="text-center py-6 space-y-4">
                        <div className="w-16 h-16 mx-auto bg-blue-500/20 rounded-full flex items-center justify-center">
                            <Coins className="text-blue-400" size={32} />
                        </div>
                        <div>
                            <p className="text-neutral-300 mb-1">Подключите TON кошелёк</p>
                            <p className="text-xs text-neutral-500">
                                Конвертируйте EcoPoints в криптовалюту TON
                            </p>
                        </div>
                    </div>
                </>
            )}

            {/* Info */}
            <div className="text-xs text-neutral-500 flex items-center gap-1 justify-center">
                <span>Курс: 1M EcoPoints = 1 TON</span>
                <ArrowUpRight size={12} />
            </div>
        </div>
    );
}

export function TONWalletPanel(props: WalletPanelProps) {
    return (
        <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
            <WalletContent {...props} />
        </TonConnectUIProvider>
    );
}

// TON Connect manifest (save as public/tonconnect-manifest.json)
export const tonConnectManifest = {
    url: 'https://microgreenuzbekistan.com',
    name: 'AgroTech Ecosystem',
    iconUrl: 'https://microgreenuzbekistan.com/icons/icon-192.png',
    termsOfUseUrl: 'https://microgreenuzbekistan.com/terms',
    privacyPolicyUrl: 'https://microgreenuzbekistan.com/privacy',
};
