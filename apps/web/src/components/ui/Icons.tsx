/**
 * Icons — re-exports from lucide-react.
 *
 * This bridge lets existing `import * as Icons from '@/components/ui/Icons'`
 * work unchanged while giving us tree-shaking and the full Lucide library.
 *
 * Migration: consumers should gradually switch to direct lucide-react imports:
 *   import { Home, Search } from 'lucide-react';
 */

export {
  Search,
  ShoppingCart,
  User,
  Home,
  Heart,
  Package,
  Moon,
  Sun,
  Sparkles,
  BookOpen,
  Hammer,
  Wrench,
  Plug,
  ShowerHead,
  Leaf,
  PaintBucket,
  Flame,
  AlertTriangle,
  CheckCircle,
  Trash,
  Droplet,
  Bath,
  Star,
  Folder,
  ClipboardList,
  Tag,
  Settings,
  Phone,
  MapPin,
  Camera,
  MessageCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  Truck,
  PartyPopper,
  XCircle,
  X,
  Plus,
  Minus,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Users,
  BarChart,
  Lightbulb,
  FileText,
  Send,
  Eye,
  Instagram,
  Navigation,
  Mic,
  MicOff,
  Calculator,
  CloudSun,
  Zap,
  Gift,
  Copy,
  Share2,
  Percent,
  Shield,
  Download,
  TrendingUp,
  TrendingDown,
  Edit,
  Lock,
  EyeOff,
  DollarSign,
  RefreshCw,
  LogOut,
  Scan,
  CalendarClock,
  MessageSquare,
} from 'lucide-react';

// Lucide doesn't ship filled variants — these wrappers preserve the old API.
import { Heart as HeartIcon, Star as StarIcon } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export function HeartFilled(props: LucideProps) {
  return <HeartIcon fill="currentColor" {...props} />;
}

export function StarFilled(props: LucideProps) {
  return <StarIcon fill="currentColor" strokeWidth={1} {...props} />;
}
