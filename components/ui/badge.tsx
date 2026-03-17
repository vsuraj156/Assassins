import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-zinc-900 text-white',
        active: 'bg-green-900 text-green-300 border border-green-700',
        exposed: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
        wanted: 'bg-orange-900 text-orange-300 border border-orange-700',
        terminated: 'bg-red-900 text-red-300 border border-red-700',
        amnesty: 'bg-blue-900 text-blue-300 border border-blue-700',
        pending: 'bg-zinc-700 text-zinc-300 border border-zinc-600',
        approved: 'bg-green-900 text-green-300 border border-green-700',
        rejected: 'bg-red-900 text-red-300 border border-red-700',
        war: 'bg-red-900 text-red-300 border border-red-700',
        outline: 'border border-zinc-700 text-zinc-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
