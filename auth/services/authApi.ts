/** API PHP scripts live under /api/ on the host (root paths return 404 HTML). */
const BASE = 'https://ghost-print.jmmagicshop.com/api';

export const post = async (path: string, data: Record<string, any>) => {
  try {
    const response = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data as any).toString(),
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    if (!contentType.includes('application/json')) {
      const preview = text.trim().startsWith('<') ? '(HTML page — check API URL)' : text.substring(0, 120);
      if (__DEV__) {
        console.warn('Non-JSON response from server:', preview);
      }
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }

    return JSON.parse(text);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to reach server');
    }
    throw error;
  }
};

export interface ValidateDeviceResponse {
  status: 'true' | 'false';
  code: string;
  message: string;
  allowed: boolean;
  userId?: number;
  emailId?: string;
  isVerified?: number;
  isLogin?: number;
}

export const validateDevice = async (deviceId: string): Promise<ValidateDeviceResponse> => {
  try {
    return (await post('validate_device.php', { deviceId })) as unknown as ValidateDeviceResponse;
  } catch (error) {
    console.error('Error validating device:', error);
    return {
      status: 'false',
      code: 'network_error',
      message: 'Network error. Please check your connection.',
      allowed: false,
    };
  }
};
