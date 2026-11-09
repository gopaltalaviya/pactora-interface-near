import {EMPTY_DRAFT, type ListingDraft} from './listing-form';

/**
 * Job templates for /jobs/new (F31): three worked examples that pre-fill the
 * form, so a first listing starts from a shape that bids well rather than a
 * blank page. A template never sets the deadline — that is the poster's own
 * date — and the price is a hint in the token's units, to be changed.
 */
export interface ListingTemplate {
  id: string;
  label: string;
  /** One line under the button: what kind of work this is. */
  blurb: string;
  draft: Partial<ListingDraft>;
}

export const LISTING_TEMPLATES: ListingTemplate[] = [
  {
    id: 'photography',
    label: 'Photograph a place',
    blurb: 'Physical · capture: someone goes there and sends photos.',
    draft: {
      title: 'Photograph the shopfront at <address>',
      description:
        'Go to <address> in daylight and take two photos of the shopfront: one straight on showing the whole sign, one from the pavement showing the entrance. Send them as evidence photos on the job.',
      category: 'physical',
      interactionMode: 'capture',
      skills: 'photography',
      criteria:
        '- Both photos are sharp and taken in daylight\n- The whole sign is readable in the first photo\n- The entrance is visible in the second photo',
      price: '2.5',
      maxWorkers: '1',
      estimatedMinutes: '45',
    },
  },
  {
    id: 'delivery',
    label: 'Deliver or run an errand',
    blurb: 'Physical · task: pick something up, drop it off, confirm with a photo.',
    draft: {
      title: 'Pick up a parcel at <place> and deliver it to <address>',
      description:
        'Collect the parcel (name on it: <name>) from <place> between <time> and <time>, deliver it to <address>, and photograph it at the door when handed over.',
      category: 'physical',
      interactionMode: 'task',
      skills: 'delivery, errand',
      criteria:
        '- The parcel is collected in the time given\n- A photo shows it delivered at the address\n- The recipient confirms in the job chat',
      price: '5',
      maxWorkers: '1',
      estimatedMinutes: '90',
    },
  },
  {
    id: 'labelling',
    label: 'Label a data set',
    blurb: 'Judgment · task: decide on each item in a set, following a guide.',
    draft: {
      title: 'Label 200 product photos by category',
      description:
        'Label each of the 200 photos linked in the job chat with one of: shoes, bags, jackets, other. The labelling guide, with examples, is linked too. Deliver the labels as a CSV of filename,label in your draft.',
      category: 'judgment',
      interactionMode: 'task',
      skills: 'data labelling, attention to detail',
      criteria:
        '- Every one of the 200 photos has exactly one label\n- At least 95% agree with the guide on a spot check of 20\n- Delivered as a CSV with two columns',
      price: '12',
      maxWorkers: '2',
      estimatedMinutes: '120',
    },
  },
];

/** The form, filled from a template: everything the template says, the rest of the draft left as it was empty. */
export function applyTemplate(t: ListingTemplate): ListingDraft {
  return {...EMPTY_DRAFT, ...t.draft};
}
