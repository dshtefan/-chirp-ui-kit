import { Box, Input, styled } from '@mui/material';
import { TextField as BaseTextField } from '@ui/lib/text-field';

export const Form = styled(Box)(() => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
}));

export const ResetInput = styled(Input)(({ theme }) => ({
    fontSize: '12px',

    input: {
        padding: 0,

        '&:not(:disabled)': {
            cursor: 'pointer',
            color: theme.palette.primaryColors.accent,
        },
    },
}));

export const TextField = styled(BaseTextField)(() => ({
    label: {
        maxWidth: 'none',
    },

    input: {
        padding: '4px 12px',
        height: 'auto',
    },
}));
