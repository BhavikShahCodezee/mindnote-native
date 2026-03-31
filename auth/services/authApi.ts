const BASE = 'https://unlock.jmmagicshop.com/api';

export const post = async (path: string, data: Record<string, any>) => {
  try {
    const response = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data as any).toString(),
    });
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response from server:', text.substring(0, 200));
      throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
    }
    return await response.json();
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
    return (await post('validate_device.php', { deviceId })) as ValidateDeviceResponse;
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
