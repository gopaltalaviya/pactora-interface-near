import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isPublicId} from '@/lib/links';
import type {ProfileDetail} from '@/lib/profiles';
import {ratingText} from '@/lib/profiles';
import {readForMetadata} from '@/lib/server-meta';
import {ProfileView} from './ProfileView';

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const id = (await params).id;
  if (!isPublicId(id)) return {title: 'Profile not found'};
  const p = await readForMetadata<ProfileDetail>(`/v1/profiles/${id}`);
  if (!p) return {title: 'Profile'};
  const description = [p.headline, ratingText(p.rating)].filter(Boolean).join(' · ');
  return {title: p.displayName, description, openGraph: {title: `${p.displayName} · Pactora`, description}};
}

/** A profile is addressed by its public UUID only; anything else is a real 404. */
export default async function ProfilePage({params}: Params) {
  const id = (await params).id;
  if (!isPublicId(id)) notFound();
  return <ProfileView profileId={id} />;
}
